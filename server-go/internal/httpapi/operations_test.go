package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/backup"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupRestoreIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, name, pw := fixtureUser(t, a, "root", false)
	token := loginFixture(t, h, name, pw)["accessToken"].(string)
	a.Config.BackupPath = t.TempDir()
	s, r := request(t, h, "POST", "/api/v1/backups", "", token)
	if s != 200 {
		t.Fatal("backup creation", s, r)
	}
	result := r["data"].(map[string]any)
	file := filepath.Base(result["filePath"].(string))
	password := result["restorePassword"].(string)
	if s, r = request(t, h, "GET", "/api/v1/backups", "", token); s != 200 || len(r["data"].([]any)) != 1 {
		t.Fatal(s, r)
	}
	body, _ := json.Marshal(map[string]string{"restorePassword": password})
	s, r = request(t, h, "POST", "/api/v1/backups/"+file+"/restore", string(body), token)
	if s != 409 {
		t.Fatal("source database restore allowed", s, r)
	}
	service := backup.Service{Config: a.Config}
	data, e := service.Prepare(file, password)
	if e != nil {
		t.Fatal(e)
	}
	// Read independent credentials without altering the active environment.
	env, e := godotenv.Read(os.Getenv("LOGMASTER_RESTORE_ENV"))
	if e != nil {
		t.Fatal("restore environment required", e)
	}
	target := a.Config
	target.Host = env["DB_HOST"]
	target.Port = env["DB_PORT"]
	target.Database = env["DB_NAME"]
	target.User = env["DB_USER"]
	target.Password = env["DB_PASSWORD"]
	target.DBSSL = false
	if e = backup.Restore(context.Background(), target, data); e != nil {
		t.Fatal(e)
	}
	c, e := target.DBConfig()
	if e != nil {
		t.Fatal(e)
	}
	restored, e := pgx.ConnectConfig(context.Background(), c)
	if e != nil {
		t.Fatal(e)
	}
	defer restored.Close(context.Background())
	var found string
	if e = restored.QueryRow(context.Background(), `SELECT username FROM "Users" WHERE username=$1`, name).Scan(&found); e != nil || found != name {
		t.Fatal("archive restored wrong database", e)
	}
	if _, e = restored.Exec(context.Background(), `CREATE TABLE go_restore_stale_object(id INTEGER)`); e != nil {
		t.Fatal(e)
	}
	restoredApp, e := New(context.Background(), target)
	if e != nil {
		t.Fatal(e)
	}
	defer restoredApp.Pool.Close()
	defer restoredApp.StopEvents()
	restoredApp.Config.BackupPath = a.Config.BackupPath
	s, r = request(t, restoredApp.Router(), "POST", "/api/v1/backups/"+file+"/restore", string(body), token)
	if s != 200 {
		t.Fatal("real restore route", s, r)
	}
	var stale bool
	if e = restored.QueryRow(context.Background(), `SELECT to_regclass('public.go_restore_stale_object') IS NOT NULL`).Scan(&stale); e != nil || stale {
		t.Fatal("stale object survived snapshot restore", e)
	}
	if s, _ = request(t, restoredApp.Router(), "GET", "/api/v1/superadmin/users", "", token); s != 401 {
		t.Fatal("restored sessions were not revoked", s)
	}
	fresh := loginFixture(t, restoredApp.Router(), name, pw)["accessToken"].(string)
	if s, _ = request(t, restoredApp.Router(), "GET", "/api/v1/superadmin/users", "", fresh); s != 200 {
		t.Fatal("fresh login after restore", s)
	}
}
func TestRetentionIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, name, pw := fixtureUser(t, a, "root", false)
	token := loginFixture(t, h, name, pw)["accessToken"].(string)
	ctx := context.Background()
	now := time.Now()
	a.Config.DataRetentionDays = 60
	a.Config.AuditRetentionDays = 365
	ids := []int32{createVisit(t, a, h, "V-98989301", "active", token), createVisit(t, a, h, "V-98989302", "active", token)}
	if s, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/checkout", ids[0]), "", token); s != 200 {
		t.Fatal(s)
	}
	old := now.AddDate(0, 0, -61)
	requestIDs := []int32{}
	for i, item := range []struct {
		status string
		date   time.Time
	}{{"completed", old}, {"completed", now}, {"pending", old}} {
		var id int32
		if e := a.Pool.QueryRow(ctx, `INSERT INTO "ArcoRequests"("requestType","subjectCedulaHash","requestedByName",status,"createdAt","updatedAt") VALUES('access',$1,'Ficticio',$2,$3,$3) RETURNING id`, fmt.Sprintf("retention_request_%d_%d", now.UnixNano(), i), item.status, item.date).Scan(&id); e != nil {
			t.Fatal(e)
		}
		requestIDs = append(requestIDs, id)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DELETE FROM "ArcoRequests" WHERE id=ANY($1)`, requestIDs); e != nil {
			t.Error(e)
		}
	})
	if _, e := a.Pool.Exec(ctx, `UPDATE "Visits" SET check_in_time=$2::timestamptz,check_out_time=CASE WHEN status='completed' THEN $2::timestamptz ELSE NULL END,"createdAt"=$2::timestamptz,"updatedAt"=$2::timestamptz WHERE id=ANY($1)`, ids, old); e != nil {
		t.Fatal(e)
	}
	for _, cedula := range []string{"V-98989301", "V-98989302"} {
		if _, e := a.Pool.Exec(ctx, `UPDATE "Visitors" SET "createdAt"=$2,"updatedAt"=$2 WHERE cedula=$1`, security.Hash(cedula), old); e != nil {
			t.Fatal(e)
		}
	}
	// Recent orphan must survive; old orphan must be removed.
	orphanIDs := []int32{}
	for i := 0; i < 2; i++ {
		id := int32(0)
		created := now
		if i == 1 {
			created = old
		}
		if e := a.Pool.QueryRow(ctx, `INSERT INTO "Visitors"(cedula,first_name,last_name,company,"createdAt","updatedAt") VALUES($1,'Ficticio','Ficticio','Ficticio',$2,$2) RETURNING id`, fmt.Sprintf("go_orphan_%d_%d", now.UnixNano(), i), created).Scan(&id); e != nil {
			t.Fatal(e)
		}
		orphanIDs = append(orphanIDs, id)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DELETE FROM "Visitors" WHERE id=ANY($1)`, orphanIDs); e != nil {
			t.Error(e)
		}
	})
	counts, e := a.Retention(ctx, now)
	if e != nil || counts["visits"] != 0 {
		t.Fatal("disabled retention ran", counts, e)
	}
	a.Config.RetentionEnabled = true
	lock, e := a.Pool.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = lock.Exec(ctx, `SELECT pg_advisory_xact_lock(584038172)`); e != nil {
		t.Fatal(e)
	}
	if counts, e = a.Retention(ctx, now); e != nil || counts["visits"] != 0 {
		t.Fatal("concurrent retention admitted", counts, e)
	}
	if e = lock.Rollback(ctx); e != nil {
		t.Fatal(e)
	}
	if _, e = a.Pool.Exec(ctx, fmt.Sprintf(`CREATE FUNCTION go_fixture_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id=%d THEN RAISE EXCEPTION 'injected'; END IF; RETURN OLD; END $$;CREATE TRIGGER go_fixture_retention BEFORE DELETE ON "Visits" FOR EACH ROW EXECUTE FUNCTION go_fixture_retention()`, ids[0])); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DROP TRIGGER IF EXISTS go_fixture_retention ON "Visits";DROP FUNCTION IF EXISTS go_fixture_retention()`); e != nil {
			t.Error(e)
		}
	})
	if _, e = a.Retention(ctx, now); e == nil {
		t.Fatal("retention failure ignored")
	}
	if _, e = a.Queries.FindVisit(ctx, ids[0]); e != nil {
		t.Fatal("retention partially committed", e)
	}
	var requestsRemaining int
	if e = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "ArcoRequests" WHERE id=ANY($1)`, requestIDs).Scan(&requestsRemaining); e != nil || requestsRemaining != 3 {
		t.Fatal("request retention partially committed", e)
	}
	if _, e = a.Pool.Exec(ctx, `DROP TRIGGER go_fixture_retention ON "Visits";DROP FUNCTION go_fixture_retention()`); e != nil {
		t.Fatal(e)
	}
	counts, e = a.Retention(ctx, now)
	if e != nil || counts["visits"] != 1 || counts["visitors"] != 2 || counts["requests"] != 1 {
		t.Fatal("retention age or openness", counts, e)
	}
	if e = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "ArcoRequests" WHERE id=ANY($1)`, requestIDs).Scan(&requestsRemaining); e != nil || requestsRemaining != 2 {
		t.Fatal("recent or pending request deleted", e)
	}
	var remaining int
	if e = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "Visitors" WHERE id=ANY($1)`, orphanIDs).Scan(&remaining); e != nil || remaining != 1 {
		t.Fatal("recent orphan deleted", e)
	}
	if _, e = a.Queries.FindVisit(ctx, ids[1]); e != nil {
		t.Fatal("open visit deleted", e)
	}
}
