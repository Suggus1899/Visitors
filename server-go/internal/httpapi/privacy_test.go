package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"net/http/httptest"
	"testing"
)

func TestPrivacyCancellationIntegration(t *testing.T) {
	a, h := integrationApp(t)
	userID, name, password := fixtureUser(t, a, "admin", false)
	token := loginFixture(t, h, name, password)["accessToken"].(string)
	cedula := "V-98989101"
	hash := security.Hash(cedula)
	id := createVisit(t, a, h, cedula, "waiting", token)
	ctx := context.Background()
	v, e := a.Queries.FindVisitor(ctx, hash)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DELETE FROM "ArcoRequests" WHERE "requestedByUserId"=$1`, userID); e != nil {
			t.Error(e)
		}
		for _, stmt := range []string{`DELETE FROM "VisitorEditHistories" WHERE "visitorId"=$1`, `DELETE FROM "Visits" WHERE visitor_id=$1`, `DELETE FROM "Visitors" WHERE id=$1`} {
			if _, e := a.Pool.Exec(ctx, stmt, v.ID); e != nil {
				t.Error(e)
			}
		}
	})
	endpoint := "/api/v1/privacy/subjects/" + cedula
	for _, state := range []string{"waiting", "active", "intermittent"} {
		if state == "active" {
			if s, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/admit", id), "", token); s != 200 {
				t.Fatal(s)
			}
		}
		if state == "intermittent" {
			if s, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/intermittent-exit", id), `{"notes":"Texto personal"}`, token); s != 200 {
				t.Fatal(s)
			}
		}
		s, result := request(t, h, "DELETE", endpoint, "", token)
		if s != 409 || result["error"].(map[string]any)["code"] != "OPEN_VISIT_EXISTS" {
			t.Fatal(state, s, result)
		}
	}
	for _, operation := range []string{"intermittent-reentry", "checkout"} {
		if s, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/%s", id, operation), "", token); s != 200 {
			t.Fatal(s)
		}
	}
	png := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte{137, 80, 78, 71})
	// Stored binary is checked directly after cancellation; image validation is covered separately.
	if _, e = a.Pool.Exec(ctx, `UPDATE "Visitors" SET photo_data=$2,id_photo_data=$2 WHERE id=$1`, v.ID, []byte(png)); e != nil {
		t.Fatal(e)
	}
	body, _ := json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "firstName": "Persona privada", "phone": "04120000000", "observations": "Información privada"})
	if s, result := request(t, h, "PATCH", "/api/v1/visitors/"+cedula, string(body), token); s != 200 {
		t.Fatal(s, result)
	}
	if s, result := request(t, h, "POST", "/api/v1/privacy/arco-requests", `{"requestType":"access","cedula":"`+cedula+`","requestedByName":"Persona privada","contactEmail":"persona@example.test","reason":"Información privada","requestPayload":{"phone":"04120000000"}}`, token); s != 201 {
		t.Fatal(s, result)
	}
	if s, _ := request(t, h, "GET", endpoint, "", token); s != 200 {
		t.Fatal(s)
	}
	// A real database failure must undo every part of cancellation.
	trigger := fmt.Sprintf(`CREATE FUNCTION go_fixture_cancel_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId"=%d AND NEW.action='ARCO_CANCELLATION_EXECUTED' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;CREATE TRIGGER go_fixture_cancel_audit BEFORE INSERT ON "ActivityLogs" FOR EACH ROW EXECUTE FUNCTION go_fixture_cancel_audit()`, userID)
	if _, e = a.Pool.Exec(ctx, trigger); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if _, e := a.Pool.Exec(ctx, `DROP TRIGGER IF EXISTS go_fixture_cancel_audit ON "ActivityLogs";DROP FUNCTION IF EXISTS go_fixture_cancel_audit()`); e != nil {
			t.Error(e)
		}
	})
	if s, _ := request(t, h, "DELETE", endpoint, "", token); s != 500 {
		t.Fatal("fault did not roll back", s)
	}
	before, e := a.Queries.FindVisitor(ctx, hash)
	if e != nil || len(before.PhotoData) == 0 || before.AnonymizedAt.Valid {
		t.Fatal("partial cancellation", e)
	}
	if _, e = a.Pool.Exec(ctx, `DROP TRIGGER go_fixture_cancel_audit ON "ActivityLogs";DROP FUNCTION go_fixture_cancel_audit()`); e != nil {
		t.Fatal(e)
	}
	if s, result := request(t, h, "DELETE", endpoint, "", token); s != 200 {
		t.Fatal(s, result)
	}
	after, e := a.Queries.FindVisitorByID(ctx, v.ID)
	if e != nil || !after.AnonymizedAt.Valid || after.Cedula == hash || after.EncryptedCedula.Valid || len(after.PhotoData) != 0 || len(after.IDPhotoData) != 0 || after.Phone.Valid || after.Observations.Valid {
		t.Fatal("personal data retained", after.ID, e)
	}
	var history, requests, intervals int
	if e = a.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM "VisitorEditHistories" WHERE "visitorId"=$1 AND ("oldValue" IS NOT NULL OR "newValue" IS NOT NULL)),(SELECT count(*) FROM "ArcoRequests" WHERE "subjectCedulaHash"=$2 AND ("subjectCedulaEncrypted" IS NOT NULL OR "contactEmail" IS NOT NULL OR reason IS NOT NULL OR "requestPayload" IS NOT NULL)),(SELECT count(*) FROM "IntermittentLogs" WHERE visit_id=$3 AND notes IS NOT NULL)`, v.ID, after.Cedula, id).Scan(&history, &requests, &intervals); e != nil || history+requests+intervals != 0 {
		t.Fatal("PII in associated tables", history, requests, intervals, e)
	}
	visit, e := a.Queries.FindVisit(ctx, id)
	if e != nil || !visit.CheckOutTime.Valid || visit.Status.EnumVisitsStatus != "completed" || visit.Notes.Valid || visit.PersonToVisit != "Anonimizado" {
		t.Fatal("events lost or personal text retained", e)
	}
	dto, e := a.visitDTO(httptest.NewRequest("GET", "/", nil), visit)
	if e != nil || dto["visitorCedula"] != nil || dto["visitorName"] != "Anonimizado" {
		t.Fatal("history identifies subject", dto, e)
	}
	newID := createVisit(t, a, h, cedula, "active", token)
	newVisitor, e := a.Queries.FindVisitor(ctx, hash)
	if e != nil || newVisitor.ID == v.ID {
		t.Fatal("cancelled profile reused", e)
	}
	if newID == id {
		t.Fatal("visit reused")
	}
	if s, _ := request(t, h, "GET", "/api/v1/visitors/"+cedula+"/edit-history", "", token); s != 200 {
		t.Fatal(s)
	}
}
