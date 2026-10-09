package db

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/contracts"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Open(c config.Config) (*sql.DB, error) {
	p, e := c.DBConfig()
	if e != nil {
		return nil, e
	}
	return stdlib.OpenDB(*p), nil
}
func Migrate(ctx context.Context, db *sql.DB) error {
	goose.SetBaseFS(migrations)
	if e := goose.SetDialect("postgres"); e != nil {
		return e
	}
	return goose.UpContext(ctx, db, "migrations")
}
func Check(ctx context.Context, db *sql.DB) error {
	var version int
	if e := db.QueryRowContext(ctx, `SELECT version_id FROM goose_db_version WHERE is_applied ORDER BY id DESC LIMIT 1`).Scan(&version); e != nil {
		return errors.New("Go migration baseline missing; run explicit adopt or migrate command")
	}
	if version != 2 {
		return fmt.Errorf("unexpected Go schema version %d", version)
	}
	return nil
}

// Adopt validates the legacy schema before recording a baseline; it does not run legacy DDL.
func Adopt(ctx context.Context, db *sql.DB) error {
	tx, e := db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(174829301)`); e != nil {
		return e
	}
	if e = validateLegacy(ctx, tx); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS goose_db_version(id BIGSERIAL PRIMARY KEY,version_id BIGINT NOT NULL,is_applied BOOLEAN NOT NULL,tstamp TIMESTAMP NOT NULL DEFAULT now()); INSERT INTO goose_db_version(version_id,is_applied) SELECT 1,true WHERE NOT EXISTS(SELECT 1 FROM goose_db_version WHERE version_id=1 AND is_applied)`); e != nil {
		return e
	}
	return tx.Commit()
}

func validateLegacy(ctx context.Context, tx *sql.Tx) error {
	raw, e := contracts.Files.ReadFile("schema-node.json")
	if e != nil {
		return e
	}
	var manifest struct {
		Columns []struct {
			Table    string `json:"table_name"`
			Column   string `json:"column_name"`
			Type     string `json:"udt_name"`
			Nullable string `json:"is_nullable"`
		}
		Constraints []struct {
			Table      string `json:"table_name"`
			Name       string `json:"name"`
			Definition string `json:"definition"`
		}
	}
	if e = json.Unmarshal(raw, &manifest); e != nil {
		return e
	}
	for _, c := range manifest.Columns {
		var typ, nullable string
		e = tx.QueryRowContext(ctx, `SELECT udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, c.Table, c.Column).Scan(&typ, &nullable)
		compatiblePurpose := c.Table == "Visits" && c.Column == "purpose" && typ == "text" && c.Type == "varchar"
		if e != nil || (typ != c.Type && !compatiblePurpose) || nullable != c.Nullable {
			return fmt.Errorf("legacy schema mismatch at %s.%s", c.Table, c.Column)
		}
	}
	for _, c := range manifest.Constraints {
		var actual string
		e = tx.QueryRowContext(ctx, `SELECT pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND con.conname=$2`, c.Table, c.Name).Scan(&actual)
		if e != nil || actual != c.Definition {
			return fmt.Errorf("legacy constraint mismatch at %s.%s", c.Table, c.Name)
		}
	}
	var indexExists bool
	if e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='visits_one_open_per_visitor' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%waiting%' AND indexdef LIKE '%active%' AND indexdef LIKE '%intermittent%')`).Scan(&indexExists); e != nil {
		return e
	}
	if !indexExists {
		return errors.New("missing open-visit uniqueness constraint")
	}
	return nil
}
