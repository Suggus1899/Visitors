package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

// Preflight reads every encrypted identity without logging personal values.
func Preflight(ctx context.Context, database *sql.DB, key []byte) error {
	var exists bool
	if e := database.QueryRowContext(ctx, `SELECT to_regclass('public."Visitors"') IS NOT NULL`).Scan(&exists); e != nil {
		return e
	}
	if !exists {
		return nil
	}
	rows, e := database.QueryContext(ctx, `SELECT id,first_name,last_name,encrypted_cedula FROM "Visitors" WHERE "anonymizedAt" IS NULL`)
	if e != nil {
		return errors.New("visitor schema incompatible with preflight")
	}
	for rows.Next() {
		var id int
		var first, last string
		var cedula sql.NullString
		if e = rows.Scan(&id, &first, &last, &cedula); e != nil {
			rows.Close()
			return e
		}
		for _, value := range []string{first, last, cedula.String} {
			if _, e = security.Decrypt(key, value); e != nil {
				rows.Close()
				return fmt.Errorf("identity decryption failed at visitor %d", id)
			}
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	var duplicates int
	if e = database.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT visitor_cedula FROM "Visits" WHERE status IN ('waiting','active','intermittent') GROUP BY visitor_cedula HAVING count(*)>1) d`).Scan(&duplicates); e != nil {
		return e
	}
	if duplicates > 0 {
		return fmt.Errorf("%d visitor identifiers have duplicate open visits; no data was removed", duplicates)
	}
	return nil
}
