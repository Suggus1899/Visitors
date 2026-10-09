package db

import (
	"context"
	"database/sql"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"strings"
)

// Encryption requires the deployment key, so it runs only during explicit preparation.
func EncryptHistory(ctx context.Context, database *sql.DB, key []byte) error {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id,field,"oldValue","newValue" FROM "VisitorEditHistories" FOR UPDATE`)
	if err != nil {
		return err
	}
	type change struct {
		id        int
		old, next sql.NullString
	}
	changes := []change{}
	for rows.Next() {
		var c change
		var field string
		if err = rows.Scan(&c.id, &field, &c.old, &c.next); err != nil {
			rows.Close()
			return err
		}
		for _, value := range []*sql.NullString{&c.old, &c.next} {
			if strings.HasPrefix(field, "photo") || strings.HasPrefix(field, "id_photo") || strings.HasPrefix(field, "idPhoto") {
				*value = sql.NullString{}
				continue
			}
			if !value.Valid {
				continue
			}
			if strings.HasPrefix(value.String, "ENC:") {
				if _, err = security.Decrypt(key, value.String); err != nil {
					rows.Close()
					return err
				}
			} else {
				value.String, err = security.Encrypt(key, value.String)
				if err != nil {
					rows.Close()
					return err
				}
			}
		}
		changes = append(changes, c)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, c := range changes {
		if _, err = tx.ExecContext(ctx, `UPDATE "VisitorEditHistories" SET "oldValue"=$1,"newValue"=$2 WHERE id=$3`, c.old, c.next, c.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
