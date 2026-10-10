package db

import (
	"context"
	"database/sql"
	"github.com/Suggus1899/Visitors/server-go/internal/search"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

func RebuildSearch(ctx context.Context, database *sql.DB, key []byte, force bool) error {
	fingerprint := search.Fingerprint(key)
	var current string
	var cursor int
	var ready bool
	if e := database.QueryRowContext(ctx, `SELECT fingerprint,cursor,ready FROM "SearchIndexState" WHERE id=true`).Scan(&current, &cursor, &ready); e != nil {
		return e
	}
	if current == fingerprint && ready && !force {
		return nil
	}
	if current != fingerprint || force {
		tx, e := database.BeginTx(ctx, nil)
		if e != nil {
			return e
		}
		defer tx.Rollback()
		if _, e = tx.ExecContext(ctx, `DELETE FROM "VisitorSearchTokens"`); e != nil {
			return e
		}
		if _, e = tx.ExecContext(ctx, `UPDATE "SearchIndexState" SET fingerprint=$1,cursor=0,ready=false WHERE id=true`, fingerprint); e != nil {
			return e
		}
		if e = tx.Commit(); e != nil {
			return e
		}
		cursor = 0
	}
	for {
		rows, e := database.QueryContext(ctx, `SELECT id,first_name,last_name,encrypted_cedula FROM "Visitors" WHERE id>$1 AND "anonymizedAt" IS NULL ORDER BY id LIMIT 1000`, cursor)
		if e != nil {
			return e
		}
		type profile struct {
			id          int
			first, last string
			cedula      sql.NullString
		}
		batch := []profile{}
		for rows.Next() {
			var p profile
			if e = rows.Scan(&p.id, &p.first, &p.last, &p.cedula); e != nil {
				rows.Close()
				return e
			}
			batch = append(batch, p)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		if len(batch) == 0 {
			_, e = database.ExecContext(ctx, `UPDATE "SearchIndexState" SET ready=true WHERE id=true AND fingerprint=$1`, fingerprint)
			return e
		}
		tx, e := database.BeginTx(ctx, nil)
		if e != nil {
			return e
		}
		ids := make([]int, len(batch))
		tokenIDs := []int{}
		tokens := [][]byte{}
		for i, p := range batch {
			var first, last, cedula string
			first, e = security.Decrypt(key, p.first)
			if e == nil {
				last, e = security.Decrypt(key, p.last)
			}
			if e == nil {
				cedula, e = security.Decrypt(key, p.cedula.String)
			}
			if e != nil {
				tx.Rollback()
				return e
			}
			ids[i] = p.id
			for _, token := range search.Tokens(key, first+" "+last+" "+cedula) {
				tokenIDs = append(tokenIDs, p.id)
				tokens = append(tokens, token)
			}
			cursor = p.id
		}
		if _, e = tx.ExecContext(ctx, `DELETE FROM "VisitorSearchTokens" WHERE visitor_id=ANY($1::integer[])`, ids); e != nil {
			tx.Rollback()
			return e
		}
		if _, e = tx.ExecContext(ctx, `INSERT INTO "VisitorSearchTokens"(visitor_id,token) SELECT * FROM unnest($1::integer[],$2::bytea[]) ON CONFLICT DO NOTHING`, tokenIDs, tokens); e != nil {
			tx.Rollback()
			return e
		}
		if _, e = tx.ExecContext(ctx, `UPDATE "SearchIndexState" SET cursor=$1 WHERE id=true`, cursor); e != nil {
			tx.Rollback()
			return e
		}
		if e = tx.Commit(); e != nil {
			return e
		}
	}
}
