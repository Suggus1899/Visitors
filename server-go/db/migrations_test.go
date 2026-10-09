package db

import (
	"context"
	"database/sql"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"os"
	"strings"
	"testing"
	"time"
)

func TestMigrationIntegration(t *testing.T) {
	if os.Getenv("LOGMASTER_DB_TEST") != "true" {
		t.Skip("requires explicit isolated database test")
	}
	c, e := config.Load()
	if e != nil {
		t.Fatal(e)
	}
	if !c.LocalTest() || c.Database != "logmaster_go_test" {
		t.Fatal("test requires logmaster_go_test on 127.0.0.1:55432")
	}
	database, e := Open(c)
	if e != nil {
		t.Fatal(e)
	}
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	t.Run("create and check baseline", func(t *testing.T) {
		if e := Migrate(ctx, database); e != nil {
			t.Fatal(e)
		}
		if e := Check(ctx, database); e != nil {
			t.Fatal(e)
		}
	})
	t.Run("adopt matching schema idempotently", func(t *testing.T) {
		if e := Adopt(ctx, database); e != nil {
			t.Fatal(e)
		}
		if e := Adopt(ctx, database); e != nil {
			t.Fatal(e)
		}
		var n int
		if e := database.QueryRowContext(ctx, `SELECT count(*) FROM goose_db_version WHERE version_id=1 AND is_applied`).Scan(&n); e != nil || n != 1 {
			t.Fatal("baseline duplicated", e)
		}
	})
	t.Run("reject altered schema before adoption", func(t *testing.T) {
		tx, e := database.BeginTx(ctx, nil)
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		if _, e = tx.ExecContext(ctx, `ALTER TABLE "Users" ALTER COLUMN email TYPE TEXT`); e != nil {
			t.Fatal(e)
		}
		if e = validateLegacy(ctx, tx); e == nil {
			t.Fatal("incompatible schema accepted")
		}
	})
	t.Run("encrypt legacy history idempotently", func(t *testing.T) {
		var visitorID, historyID, photoID int
		if e := database.QueryRowContext(ctx, `INSERT INTO "Visitors"(cedula,first_name,last_name,company,"createdAt","updatedAt") VALUES('go_history_fixture','Ficticio','Ficticio','Ficticio',now(),now()) RETURNING id`).Scan(&visitorID); e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() {
			database.ExecContext(context.Background(), `DELETE FROM "VisitorEditHistories" WHERE "visitorId"=$1`, visitorID)
			database.ExecContext(context.Background(), `DELETE FROM "Visitors" WHERE id=$1`, visitorID)
		})
		for _, item := range []struct {
			field, value string
			id           *int
		}{{"firstName", "Dato ficticio", &historyID}, {"id_photo_data", "foto ficticia", &photoID}} {
			if e := database.QueryRowContext(ctx, `INSERT INTO "VisitorEditHistories"("visitorId",field,"oldValue","newValue","editedBy","editedByUsername","editedAt","createdAt") VALUES($1,$2,$3,$3,1,'ficticio',now(),now()) RETURNING id`, visitorID, item.field, item.value).Scan(item.id); e != nil {
				t.Fatal(e)
			}
		}
		if e := EncryptHistory(ctx, database, c.EncryptionKey); e != nil {
			t.Fatal(e)
		}
		var first, second string
		if e := database.QueryRowContext(ctx, `SELECT "oldValue" FROM "VisitorEditHistories" WHERE id=$1`, historyID).Scan(&first); e != nil {
			t.Fatal(e)
		}
		if !strings.HasPrefix(first, "ENC:") {
			t.Fatal("history remains plaintext")
		}
		if clear, e := security.Decrypt(c.EncryptionKey, first); e != nil || clear != "Dato ficticio" {
			t.Fatal("history corrupted", e)
		}
		if e := EncryptHistory(ctx, database, c.EncryptionKey); e != nil {
			t.Fatal(e)
		}
		if e := database.QueryRowContext(ctx, `SELECT "oldValue" FROM "VisitorEditHistories" WHERE id=$1`, historyID).Scan(&second); e != nil || first != second {
			t.Fatal("history double encrypted", e)
		}
		var oldPhoto sql.NullString
		if e := database.QueryRowContext(ctx, `SELECT "oldValue" FROM "VisitorEditHistories" WHERE id=$1`, photoID).Scan(&oldPhoto); e != nil || oldPhoto.Valid {
			t.Fatal("photo retained in history", e)
		}
	})
}
