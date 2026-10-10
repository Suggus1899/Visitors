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
	rows, e := database.QueryContext(ctx, `SELECT id,first_name,last_name,encrypted_cedula,job_title,email,phone,observations FROM "Visitors" WHERE "anonymizedAt" IS NULL`)
	if e != nil {
		return errors.New("visitor schema incompatible with preflight")
	}
	for rows.Next() {
		var id int
		var first, last string
		var cedula sql.NullString
		var job, email, phone, observations sql.NullString
		if e = rows.Scan(&id, &first, &last, &cedula, &job, &email, &phone, &observations); e != nil {
			rows.Close()
			return e
		}
		for _, value := range []string{first, last, cedula.String, job.String, email.String, phone.String, observations.String} {
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
	var broken int
	if e = database.QueryRowContext(ctx, `SELECT count(*) FROM "Visits" v LEFT JOIN "Visitors" p ON p.cedula=v.visitor_cedula WHERE p.id IS NULL OR (v.visitor_id IS NOT NULL AND v.visitor_id<>p.id)`).Scan(&broken); e != nil {
		return e
	}
	if broken > 0 {
		return fmt.Errorf("%d visits have incompatible visitor relationships", broken)
	}
	return nil
}
