package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"strings"
	"testing"
)

func TestAuditFailureRollsBackIntegration(t *testing.T) {
	a, h := integrationApp(t)
	userID, username, password := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, username, password)["accessToken"].(string)
	id := createVisit(t, a, h, "V-98989004", "active", token)
	ctx := context.Background()
	_, e := a.Pool.Exec(ctx, fmt.Sprintf(`CREATE FUNCTION go_fixture_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId"=%d THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER go_fixture_reject_audit BEFORE INSERT ON "ActivityLogs" FOR EACH ROW EXECUTE FUNCTION go_fixture_reject_audit()`, userID))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DROP TRIGGER IF EXISTS go_fixture_reject_audit ON "ActivityLogs"; DROP FUNCTION IF EXISTS go_fixture_reject_audit()`); e != nil {
			t.Error(e)
		}
	})
	t.Run("exit and interval roll back together", func(t *testing.T) {
		status, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/intermittent-exit", id), "{}", token)
		if status != 500 {
			t.Fatal(status)
		}
		var state string
		var logs int
		e := a.Pool.QueryRow(ctx, `SELECT status::text,(SELECT count(*) FROM "IntermittentLogs" WHERE visit_id=$1) FROM "Visits" WHERE id=$1`, id).Scan(&state, &logs)
		if e != nil || state != "active" || logs != 0 {
			t.Fatal("partial transition", state, logs, e)
		}
	})
	t.Run("edit and history roll back together", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"editPassword": a.Config.EditPassword, "firstName": "Fallido"})
		status, _ := request(t, h, "PATCH", "/api/v1/visitors/V-98989004", string(body), token)
		if status != 500 {
			t.Fatal(status)
		}
		v, e := a.Queries.FindVisitor(ctx, security.Hash("V-98989004"))
		if e != nil {
			t.Fatal(e)
		}
		name, e := security.Decrypt(a.Config.EncryptionKey, v.FirstName)
		if e != nil || name != "Visitante" {
			t.Fatal("partial edit")
		}
		var count int
		e = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "VisitorEditHistories" WHERE "visitorId"=$1`, v.ID).Scan(&count)
		if e != nil || count != 0 {
			t.Fatal("history committed without audit")
		}
	})
	t.Run("new profile and visit roll back together", func(t *testing.T) {
		status, _ := request(t, h, "POST", "/api/v1/visits/checkin", visitorRequest("V-98989005", "active"), token)
		if status != 500 {
			t.Fatal(status)
		}
		var count int
		e := a.Pool.QueryRow(ctx, `SELECT count(*) FROM "Visitors" WHERE cedula=$1`, security.Hash("V-98989005")).Scan(&count)
		if e != nil || count != 0 {
			t.Fatal("orphan profile after failed visit")
		}
	})
}
func TestLongPurposeIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, username, password := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, username, password)["accessToken"].(string)
	var body CheckIn
	json.Unmarshal([]byte(visitorRequest("V-98989006", "active")), &body)
	body.Purpose = strings.Repeat("a", 300)
	raw, _ := json.Marshal(body)
	status, result := request(t, h, "POST", "/api/v1/visits/checkin", string(raw), token)
	if status != 201 {
		t.Fatal("schema rejects validated purpose", status, result)
	}
	hash := security.Hash("V-98989006")
	t.Cleanup(func() {
		a.Pool.Exec(context.Background(), `DELETE FROM "Visits" WHERE visitor_cedula=$1`, hash)
		a.Pool.Exec(context.Background(), `DELETE FROM "Visitors" WHERE cedula=$1`, hash)
	})
}
