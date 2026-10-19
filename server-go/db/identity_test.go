package db

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

func TestProtectedIdentityMigrationIntegration(t *testing.T) {
	if os.Getenv("LOGMASTER_DB_TEST") != "true" {
		t.Skip("requires explicit isolated database test")
	}
	c, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if !c.LocalTest() || c.Database != "logmaster_go_test" {
		t.Fatal("test requires logmaster_go_test on 127.0.0.1:55432")
	}
	database, err := Open(c)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err = Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}

	suffix := time.Now().UnixNano() % 100000000
	cedula := fmt.Sprintf("V-%08d", suffix)
	legacyHash := security.Hash(cedula)
	anonymous := fmt.Sprintf("anon-migration-%d", suffix)
	cipher, err := security.Encrypt(c.EncryptionKey, cedula)
	if err != nil {
		t.Fatal(err)
	}
	var visitorID, anonymousID, arcoID, anonymousArcoID, rollbackVisitorID, rollbackArcoID int64
	now := time.Now().UTC()
	for _, item := range []struct {
		ref        string
		encrypted  any
		anonymized any
		id         *int64
	}{{legacyHash, cipher, nil, &visitorID}, {anonymous, nil, now, &anonymousID}} {
		if err = database.QueryRowContext(ctx, `INSERT INTO "Visitors"(cedula,encrypted_cedula,first_name,last_name,company,"anonymizedAt","createdAt","updatedAt") VALUES($1,$2,'Ficticio','Prueba','Empresa ficticia',$3,$4,$4) RETURNING id`, item.ref, item.encrypted, item.anonymized, now).Scan(item.id); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = database.ExecContext(context.Background(), `DELETE FROM "ArcoRequests" WHERE id=ANY($1)`, []int64{arcoID, anonymousArcoID, rollbackArcoID})
		_, _ = database.ExecContext(context.Background(), `DELETE FROM "Visits" WHERE visitor_id=$1 OR visitor_id=$2 OR visitor_id=$3`, visitorID, anonymousID, rollbackVisitorID)
		_, _ = database.ExecContext(context.Background(), `DELETE FROM "Visitors" WHERE id=$1 OR id=$2 OR id=$3`, visitorID, anonymousID, rollbackVisitorID)
	})
	for _, item := range []struct {
		visitorID int64
		ref       string
		status    string
	}{
		{visitorID, legacyHash, "completed"},
		{anonymousID, anonymous, "completed"},
	} {
		if _, err = database.ExecContext(ctx, `INSERT INTO "Visits"(visitor_cedula,visitor_id,purpose,person_to_visit,status,check_in_time,check_out_time,"createdAt","updatedAt") VALUES($1,$2,'Prueba ficticia','Responsable ficticio',$3,$4,$4,$4,$4)`, item.ref, item.visitorID, item.status, now); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []struct {
		ref       string
		encrypted any
		id        *int64
	}{{legacyHash, cipher, &arcoID}, {anonymous, nil, &anonymousArcoID}} {
		if err = database.QueryRowContext(ctx, `INSERT INTO "ArcoRequests"("requestType","subjectCedulaHash","subjectCedulaEncrypted","requestedByName","createdAt","updatedAt") VALUES('access',$1,$2,'Prueba ficticia',$3,$3) RETURNING id`, item.ref, item.encrypted, now).Scan(item.id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = database.ExecContext(ctx, `UPDATE "IdentityIndexState" SET ready=false WHERE id=true`); err != nil {
		t.Fatal(err)
	}
	wrongKey := append([]byte(nil), c.EncryptionKey...)
	wrongKey[0] ^= 0xff
	if err = RebuildIdentity(ctx, database, wrongKey, false); err == nil {
		t.Fatal("wrong encryption key was accepted")
	}
	var stored string
	if err = database.QueryRowContext(ctx, `SELECT cedula FROM "Visitors" WHERE id=$1`, visitorID).Scan(&stored); err != nil || stored != legacyHash {
		t.Fatal("failed key check modified visitor identity", err)
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err != nil {
		t.Fatal(err)
	}
	want := security.IdentityHash(c.EncryptionKey, cedula)
	for _, item := range []struct {
		query string
		id    int64
		want  string
	}{
		{`SELECT cedula FROM "Visitors" WHERE id=$1`, visitorID, want},
		{`SELECT visitor_cedula FROM "Visits" WHERE visitor_id=$1`, visitorID, want},
		{`SELECT "subjectCedulaHash" FROM "ArcoRequests" WHERE id=$1`, arcoID, want},
		{`SELECT cedula FROM "Visitors" WHERE id=$1`, anonymousID, anonymous},
		{`SELECT visitor_cedula FROM "Visits" WHERE visitor_id=$1`, anonymousID, anonymous},
		{`SELECT "subjectCedulaHash" FROM "ArcoRequests" WHERE id=$1`, anonymousArcoID, anonymous},
	} {
		if err = database.QueryRowContext(ctx, item.query, item.id).Scan(&stored); err != nil || stored != item.want {
			t.Fatalf("identity reference mismatch: got %q, want %q: %v", stored, item.want, err)
		}
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err != nil {
		t.Fatalf("idempotent rebuild failed: %v", err)
	}

	rollbackCedula := fmt.Sprintf("V-%08d", (suffix+1)%100000000)
	rollbackHash := security.Hash(rollbackCedula)
	rollbackCipher, err := security.Encrypt(c.EncryptionKey, rollbackCedula)
	if err != nil {
		t.Fatal(err)
	}
	if err = database.QueryRowContext(ctx, `INSERT INTO "Visitors"(cedula,encrypted_cedula,first_name,last_name,company,"createdAt","updatedAt") VALUES($1,$2,'Ficticio','Reversión','Empresa ficticia',$3,$3) RETURNING id`, rollbackHash, rollbackCipher, now).Scan(&rollbackVisitorID); err != nil {
		t.Fatal(err)
	}
	if err = database.QueryRowContext(ctx, `INSERT INTO "ArcoRequests"("requestType","subjectCedulaHash","requestedByName","createdAt","updatedAt") VALUES('access',$1,'Prueba de reversión',$2,$2) RETURNING id`, "missing-migration-reference", now).Scan(&rollbackArcoID); err != nil {
		t.Fatal(err)
	}
	if _, err = database.ExecContext(ctx, `UPDATE "IdentityIndexState" SET ready=false WHERE id=true`); err != nil {
		t.Fatal(err)
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err == nil {
		t.Fatal("invalid privacy reference was accepted")
	}
	if err = database.QueryRowContext(ctx, `SELECT cedula FROM "Visitors" WHERE id=$1`, rollbackVisitorID).Scan(&stored); err != nil || stored != rollbackHash {
		t.Fatal("failed migration did not roll back updated visitors", err)
	}
	if _, err = database.ExecContext(ctx, `DELETE FROM "ArcoRequests" WHERE id=$1`, rollbackArcoID); err != nil {
		t.Fatal(err)
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err != nil {
		t.Fatal(err)
	}
	if err = database.QueryRowContext(ctx, `SELECT cedula FROM "Visitors" WHERE id=$1`, rollbackVisitorID).Scan(&stored); err != nil || stored != security.IdentityHash(c.EncryptionKey, rollbackCedula) {
		t.Fatal("corrected migration did not update the visitor", err)
	}

	variant := " " + cedula[:1] + " " + cedula[2:] + " "
	duplicateCipher, err := security.Encrypt(c.EncryptionKey, variant)
	if err != nil {
		t.Fatal(err)
	}
	var duplicateID int64
	if err = database.QueryRowContext(ctx, `INSERT INTO "Visitors"(cedula,encrypted_cedula,first_name,last_name,company,"createdAt","updatedAt") VALUES($1,$2,'Ficticio','Duplicado','Empresa ficticia',$3,$3) RETURNING id`, security.Hash(variant), duplicateCipher, now).Scan(&duplicateID); err != nil {
		t.Fatal(err)
	}
	if _, err = database.ExecContext(ctx, `UPDATE "IdentityIndexState" SET ready=false WHERE id=true`); err != nil {
		t.Fatal(err)
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err == nil {
		t.Fatal("duplicate decrypted identity was accepted")
	}
	if err = database.QueryRowContext(ctx, `SELECT cedula FROM "Visitors" WHERE id=$1`, duplicateID).Scan(&stored); err != nil || stored != security.Hash(variant) {
		t.Fatal("failed duplicate check partially changed identity", err)
	}
	if _, err = database.ExecContext(ctx, `DELETE FROM "Visitors" WHERE id=$1`, duplicateID); err != nil {
		t.Fatal(err)
	}
	if err = RebuildIdentity(ctx, database, c.EncryptionKey, false); err != nil {
		t.Fatal(err)
	}
	var ready bool
	var fingerprint string
	if err = database.QueryRowContext(ctx, `SELECT ready,fingerprint FROM "IdentityIndexState" WHERE id=true`).Scan(&ready, &fingerprint); err != nil || !ready || fingerprint != security.IdentityFingerprint(c.EncryptionKey) {
		t.Fatal("identity index was not marked ready after verification", err)
	}
}
