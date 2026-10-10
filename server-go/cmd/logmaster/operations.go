package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/backup"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/joho/godotenv"
	"io"
	"net/mail"
	"os"
	"strings"
	"time"
)

func operations(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: logmaster ops preflight|adopt|migrate|bootstrap-root|restore [--apply --confirm-target host:port/database]")
	}
	command := args[0]
	flags := flag.NewFlagSet("ops "+command, flag.ContinueOnError)
	apply := flags.Bool("apply", false, "execute; otherwise validate only")
	confirmation := flags.String("confirm-target", "", "exact host:port/database")
	username := flags.String("root", "root", "root actor username")
	passwordFile := flags.String("password-file", "", "private password file")
	email := flags.String("email", "", "root email")
	archive := flags.String("archive", "", "backup filename, never a filesystem path")
	stageFile := flags.String("staging-env", "", "independent disposable staging environment")
	if e := flags.Parse(args[1:]); e != nil {
		return e
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments")
	}
	switch command {
	case "preflight", "adopt", "migrate", "bootstrap-root", "restore":
	default:
		return errors.New("unknown maintenance command")
	}
	c, e := config.Load()
	if e != nil {
		return e
	}
	target := c.Host + ":" + c.Port + "/" + c.Database
	if *apply && *confirmation != target {
		return errors.New("exact destination confirmation required")
	}
	database, e := db.Open(c)
	if e != nil {
		return e
	}
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if e = database.PingContext(ctx); e != nil {
		return errors.New("database connection failed")
	}
	if e = db.Preflight(ctx, database, c.EncryptionKey); e != nil {
		return e
	}
	if command == "restore" {
		if *stageFile == "" || *passwordFile == "" {
			return errors.New("restore requires staging environment and private password file")
		}
		if _, e = stagingConfig(c, *stageFile); e != nil {
			return e
		}
		raw, e := readPassword(*passwordFile)
		if e != nil {
			return e
		}
		if _, e = (backup.Service{Config: c}).Prepare(*archive, string(raw)); e != nil {
			return e
		}
	}
	if command == "bootstrap-root" {
		address, e := mail.ParseAddress(*email)
		if e != nil || address.Address != *email {
			return errors.New("valid root email required")
		}
		raw, e := readPassword(*passwordFile)
		if e != nil {
			return e
		}
		if e = security.ValidatePassword(string(raw)); e != nil {
			return e
		}
	}
	if !*apply || command == "preflight" {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"command": command, "target": target, "dryRun": true, "validated": true})
	}
	var connections int
	if e = database.QueryRowContext(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'`).Scan(&connections); e != nil {
		return e
	}
	if connections != 0 {
		return errors.New("stop the application and other database clients before maintenance")
	}
	switch command {
	case "adopt":
		e = db.Adopt(ctx, database)
	case "migrate":
		e = db.Migrate(ctx, database)
		if e == nil {
			e = db.EncryptHistory(ctx, database, c.EncryptionKey)
		}
		if e == nil {
			e = db.RebuildSearch(ctx, database, c.EncryptionKey, false)
		}
	case "bootstrap-root":
		e = bootstrapRoot(ctx, database, *username, *email, *passwordFile)
	case "restore":
		if *stageFile == "" || *passwordFile == "" {
			return errors.New("restore requires staging environment and private password file")
		}
		var raw []byte
		raw, e = readPassword(*passwordFile)
		if e != nil {
			return e
		}
		var data []byte
		data, e = (backup.Service{Config: c}).Prepare(*archive, string(raw))
		if e != nil {
			return e
		}
		var env map[string]string
		env, e = godotenv.Read(*stageFile)
		if e != nil {
			return errors.New("staging environment unavailable")
		}
		stage := c
		stage.Host = env["DB_HOST"]
		stage.Port = env["DB_PORT"]
		stage.Database = env["DB_NAME"]
		stage.User = env["DB_USER"]
		stage.Password = env["DB_PASSWORD"]
		stage.DBSSL = env["DB_SSL"] == "true"
		if stage.Database != "logmaster_restore_test" || stage.Host == "" || stage.Port == "" || stage.Host == c.Host && stage.Port == c.Port && stage.Database == c.Database {
			return errors.New("staging must be an independent logmaster_restore_test")
		}
		if stage.User == "" || stage.Password == "" {
			return errors.New("explicit staging credentials required")
		}
		if e = backup.RestoreAs(ctx, stage, data, "", true); e != nil {
			return e
		}
		var staged *sql.DB
		staged, e = db.Open(stage)
		if e != nil {
			return e
		}
		defer staged.Close()
		if e = db.Preflight(ctx, staged, c.EncryptionKey); e != nil {
			return e
		}
		var baseline bool
		if e = staged.QueryRowContext(ctx, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`).Scan(&baseline); e != nil {
			return e
		}
		if !baseline {
			if e = db.Adopt(ctx, staged); e != nil {
				return e
			}
		}
		if e = db.Migrate(ctx, staged); e != nil {
			return e
		}
		if e = db.EncryptHistory(ctx, staged, c.EncryptionKey); e != nil {
			return e
		}
		if e = db.RebuildSearch(ctx, staged, c.EncryptionKey, false); e != nil {
			return e
		}
		if e = db.Check(ctx, staged); e != nil {
			return e
		}
		// Re-archive the validated current schema; never apply an unchecked legacy snapshot.
		stage.BackupPath = c.BackupPath
		var prepared backup.Result
		service := backup.Service{Config: stage}
		prepared, e = service.Create(ctx)
		if e != nil {
			return e
		}
		name := prepared.FilePath[strings.LastIndexAny(prepared.FilePath, "/\\")+1:]
		defer service.Remove(name)
		data, e = service.Prepare(name, prepared.RestorePassword)
		if e != nil {
			return e
		}
		e = backup.RestoreAs(ctx, c, data, *username, true)
	}
	if e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"command": command, "target": target, "completed": true})
}

func readPassword(path string) ([]byte, error) {
	file, e := os.Open(path)
	if e != nil {
		return nil, errors.New("private password file unavailable")
	}
	defer file.Close()
	raw, e := io.ReadAll(io.LimitReader(file, 201))
	if e != nil {
		return nil, e
	}
	if len(raw) > 200 {
		return nil, errors.New("password file too large")
	}
	raw = []byte(strings.TrimRight(string(raw), "\r\n"))
	if len(raw) == 0 {
		return nil, errors.New("empty password file")
	}
	return raw, nil
}

func bootstrapRoot(ctx context.Context, database *sql.DB, username, email, passwordFile string) error {
	if username == "" || len(username) > 255 {
		return errors.New("invalid root username")
	}
	address, e := mail.ParseAddress(email)
	if e != nil || address.Address != email {
		return errors.New("valid root email required")
	}
	raw, e := readPassword(passwordFile)
	if e != nil {
		return e
	}
	if e = security.ValidatePassword(string(raw)); e != nil {
		return e
	}
	hash, e := security.PasswordHash(string(raw))
	if e != nil {
		return e
	}
	tx, e := database.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(174829301)`); e != nil {
		return e
	}
	var exists bool
	if e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM "Users" WHERE role='root')`).Scan(&exists); e != nil {
		return e
	}
	if exists {
		return errors.New("root already exists; no account was modified")
	}
	var id int
	if e = tx.QueryRowContext(ctx, `INSERT INTO "Users"(username,password,role,email,"mustChangePassword","createdAt","updatedAt") VALUES($1,$2,'root',$3,true,now(),now()) RETURNING id`, username, hash, email).Scan(&id); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, `INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",role,status,"createdAt") VALUES($1,$2,'ROOT_BOOTSTRAPPED','User',$3,'root','success',now())`, id, username, fmt.Sprint(id)); e != nil {
		return e
	}
	return tx.Commit()
}
