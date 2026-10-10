package httpapi

import (
	"context"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/internal/search"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/jackc/pgx/v5/pgtype"
	"strings"
	"unicode/utf8"
)

var errShortSearch = errors.New("SEARCH_TOO_SHORT")

func validateSearch(value string) error {
	if strings.TrimSpace(value) != "" && utf8.RuneCountInString(strings.TrimSpace(value)) < 3 {
		return errShortSearch
	}
	return nil
}
func (a *App) indexVisitor(ctx context.Context, tx store.DBTX, id int32) error {
	var first, last string
	var cedula pgtype.Text
	var anonymized pgtype.Timestamptz
	if e := tx.QueryRow(ctx, `SELECT first_name,last_name,encrypted_cedula,"anonymizedAt" FROM "Visitors" WHERE id=$1`, id).Scan(&first, &last, &cedula, &anonymized); e != nil {
		return e
	}
	if _, e := tx.Exec(ctx, `DELETE FROM "VisitorSearchTokens" WHERE visitor_id=$1`, id); e != nil {
		return e
	}
	if anonymized.Valid {
		return nil
	}
	var e error
	first, e = security.Decrypt(a.Config.EncryptionKey, first)
	if e != nil {
		return e
	}
	last, e = security.Decrypt(a.Config.EncryptionKey, last)
	if e != nil {
		return e
	}
	plain, e := security.Decrypt(a.Config.EncryptionKey, cedula.String)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO "VisitorSearchTokens"(visitor_id,token) SELECT $1,unnest($2::bytea[]) ON CONFLICT DO NOTHING`, id, search.Tokens(a.Config.EncryptionKey, first+" "+last+" "+plain))
	return e
}
