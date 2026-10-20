package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func visitorRequest(cedula, status string) string {
	b := CheckIn{VisitorCedula: cedula, Purpose: "Visita de prueba", PersonToVisit: "Anfitrión ficticio", TargetDepartment: "Sistemas", HostPerson: "Anfitrión ficticio", Status: status, VisitorData: &VisitorData{FirstName: "Visitante", LastName: "Ficticio", Company: "Empresa ficticia"}}
	b.Consent.Accepted = true
	b.Consent.PolicyVersion = "1.0"
	b.Consent.AcceptedAt = time.Now().UTC().Format(time.RFC3339Nano)
	data, _ := json.Marshal(b)
	return string(data)
}
func createVisit(t *testing.T, a *App, h http.Handler, cedula, status, token string) int32 {
	t.Helper()
	statusCode, response := request(t, h, "POST", "/api/v1/visits/checkin", visitorRequest(cedula, status), token)
	if statusCode != 201 {
		t.Fatalf("checkin %d %v", statusCode, response)
	}
	id := int32(response["data"].(map[string]any)["id"].(float64))
	t.Cleanup(func() {
		hash := security.IdentityHash(a.Config.EncryptionKey, cedula)
		_, e := a.Pool.Exec(context.Background(), `DELETE FROM "VisitorEditHistories" WHERE "visitorId" IN (SELECT id FROM "Visitors" WHERE cedula=$1)`, hash)
		if e != nil {
			t.Error(e)
		}
		_, e = a.Pool.Exec(context.Background(), `DELETE FROM "Visits" WHERE visitor_cedula=$1`, hash)
		if e != nil {
			t.Error(e)
		}
		_, e = a.Pool.Exec(context.Background(), `DELETE FROM "Visitors" WHERE cedula=$1`, hash)
		if e != nil {
			t.Error(e)
		}
	})
	return id
}

func TestVisitLifecycleIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, username, password := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, username, password)["accessToken"].(string)
	id := createVisit(t, a, h, "V-98989001", "waiting", token)
	endpoint := fmt.Sprintf("/api/v1/visits/%d/", id)
	for _, step := range []struct {
		path, body string
		status     int
	}{{"checkout", "{}", 409}, {"admit", "", 200}, {"intermittent-exit", `{"notes":"Salida ficticia"}`, 200}, {"checkout", "{}", 409}, {"intermittent-reentry", "{}", 200}, {"checkout", `{"notes":"Observaciones de cierre"}`, 200}, {"checkout", "{}", 409}} {
		status, response := request(t, h, "POST", endpoint+step.path, step.body, token)
		if status != step.status {
			t.Fatalf("%s: %d %v", step.path, status, response)
		}
	}
	var exitValid, consent bool
	var events int
	e := a.Pool.QueryRow(context.Background(), `SELECT exit_time IS NOT NULL AND exit_time=check_out_time,consent_policy_version='1.0' AND consent_accepted_at IS NOT NULL FROM "Visits" WHERE id=$1`, id).Scan(&exitValid, &consent)
	if e != nil || !exitValid || !consent {
		t.Fatal("exit or immutable consent missing", e)
	}
	e = a.Pool.QueryRow(context.Background(), `SELECT count(*) FROM "ActivityLogs" WHERE entity='Visit' AND "entityId"=$1 AND "userId"=(SELECT id FROM "Users" WHERE username=$2)`, fmt.Sprint(id), username).Scan(&events)
	if e != nil || events != 5 {
		t.Fatal("operational audit incomplete", events, e)
	}
	t.Run("same cedula creates another visit after close", func(t *testing.T) {
		status, _ := request(t, h, "POST", "/api/v1/visits/checkin", visitorRequest("V-98989001", "active"), token)
		if status != 201 {
			t.Fatal(status)
		}
		status, _ = request(t, h, "POST", "/api/v1/visits/checkin", visitorRequest("V-98989001", "active"), token)
		if status != 409 {
			t.Fatal("duplicate open visit", status)
		}
	})
}

func TestCancelWaitingVisitIntegration(t *testing.T) {
	a, h := integrationApp(t)
	userID, username, password := fixtureUser(t, a, "operador", false)
	operator := loginFixture(t, h, username, password)["accessToken"].(string)
	cedula := "V-98989077"
	id := createVisit(t, a, h, cedula, "waiting", operator)
	path := fmt.Sprintf("/api/v1/visits/%d/cancel", id)
	if status, _ := request(t, h, "POST", path, `{}`, operator); status != 400 {
		t.Fatalf("missing cancellation reason accepted: %d", status)
	}
	if status, _ := request(t, h, "POST", path, `{"reason":"  "}`, operator); status != 400 {
		t.Fatalf("blank cancellation reason accepted: %d", status)
	}
	if status, _ := request(t, h, "POST", path, `{"reason":"`+strings.Repeat("x", 1001)+`"}`, operator); status != 400 {
		t.Fatalf("oversized cancellation reason accepted: %d", status)
	}
	if status, _ := request(t, h, "POST", path, `{"reason":"Solicitud cancelada"}`, ""); status != 401 {
		t.Fatalf("unauthenticated cancellation accepted: %d", status)
	}
	for _, role := range []string{"auditor", "demo"} {
		_, name, pw := fixtureUser(t, a, role, false)
		token := loginFixture(t, h, name, pw)["accessToken"].(string)
		if status, _ := request(t, h, "POST", path, `{"reason":"Solicitud cancelada"}`, token); status != 403 {
			t.Fatalf("%s was allowed to cancel: %d", role, status)
		}
	}
	ctx := context.Background()
	_, err := a.Pool.Exec(ctx, `CREATE FUNCTION go_fixture_reject_visit_cancel_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='VISIT_CANCELLED' THEN RAISE EXCEPTION 'injected visit cancel audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER go_fixture_reject_visit_cancel_audit BEFORE INSERT ON "ActivityLogs" FOR EACH ROW EXECUTE FUNCTION go_fixture_reject_visit_cancel_audit()`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := a.Pool.Exec(ctx, `DROP TRIGGER IF EXISTS go_fixture_reject_visit_cancel_audit ON "ActivityLogs"; DROP FUNCTION IF EXISTS go_fixture_reject_visit_cancel_audit()`); err != nil {
			t.Error(err)
		}
	})
	if status, _ := request(t, h, "POST", path, `{"reason":"Error de auditoría"}`, operator); status != 500 {
		t.Fatalf("audit failure did not fail cancellation: %d", status)
	}
	visit, err := a.Queries.FindVisit(ctx, id)
	if err != nil || visit.Status.EnumVisitsStatus != "waiting" {
		t.Fatalf("audit failure committed cancellation: %v %v", visit.Status, err)
	}
	if _, err = a.Pool.Exec(ctx, `DROP TRIGGER go_fixture_reject_visit_cancel_audit ON "ActivityLogs"; DROP FUNCTION go_fixture_reject_visit_cancel_audit()`); err != nil {
		t.Fatal(err)
	}
	if status, result := request(t, h, "POST", path, `{"reason":"El anfitrión suspendió la visita"}`, operator); status != 200 {
		t.Fatalf("cancel failed: %d %v", status, result)
	} else {
		data := result["data"].(map[string]any)
		if data["status"] != "cancelled" || data["cancellationReason"] != "El anfitrión suspendió la visita" {
			t.Fatalf("cancellation response missing state/reason: %#v", data)
		}
	}
	var actorID int32
	var created time.Time
	if err = a.Pool.QueryRow(ctx, `SELECT "userId","createdAt" FROM "ActivityLogs" WHERE action='VISIT_CANCELLED' AND "entityId"=$1`, fmt.Sprint(id)).Scan(&actorID, &created); err != nil || actorID != userID || created.IsZero() {
		t.Fatalf("cancellation audit missing actor/time: actor=%d at=%v err=%v", actorID, created, err)
	}
	for _, operation := range []string{"admit", "cancel"} {
		body := ""
		if operation == "cancel" {
			body = `{"reason":"Reintento"}`
		}
		if status, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/%s", id, operation), body, operator); status != 409 {
			t.Fatalf("cancelled visit allowed %s: %d", operation, status)
		}
	}
	newID := createVisit(t, a, h, cedula, "active", operator)
	if newID == id {
		t.Fatal("new visit reused the cancelled event")
	}

	adminID, adminName, adminPassword := fixtureUser(t, a, "admin", false)
	admin := loginFixture(t, h, adminName, adminPassword)["accessToken"].(string)
	adminVisit := createVisit(t, a, h, "V-98989078", "waiting", admin)
	if status, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/cancel", adminVisit), `{"reason":"A solicitud de recepción"}`, admin); status != 200 {
		t.Fatalf("admin cancellation denied: %d", status)
	}
	rootID, rootName, rootPassword := fixtureUser(t, a, "root", false)
	root := loginFixture(t, h, rootName, rootPassword)["accessToken"].(string)
	rootVisit := createVisit(t, a, h, "V-98989079", "waiting", root)
	if status, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/cancel", rootVisit), `{"reason":"A solicitud de recepción"}`, root); status != 200 {
		t.Fatalf("root cancellation denied: %d", status)
	}
	var adminAudit, rootAudit int
	if err = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "ActivityLogs" WHERE "userId"=$1 AND action='VISIT_CANCELLED'`, adminID).Scan(&adminAudit); err != nil || adminAudit != 1 {
		t.Fatalf("admin audit missing: %d %v", adminAudit, err)
	}
	if err = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "ActivityLogs" WHERE "userId"=$1 AND action='VISIT_CANCELLED'`, rootID).Scan(&rootAudit); err != nil || rootAudit != 1 {
		t.Fatalf("root audit missing: %d %v", rootAudit, err)
	}

	raceID := createVisit(t, a, h, "V-98989080", "waiting", operator)
	racePath := fmt.Sprintf("/api/v1/visits/%d/", raceID)
	start := make(chan struct{})
	results := make(chan int, 2)
	var wg sync.WaitGroup
	for _, operation := range []struct{ path, body string }{{"admit", ""}, {"cancel", `{"reason":"Carril cerrado"}`}} {
		wg.Add(1)
		go func(path, body string) {
			defer wg.Done()
			<-start
			req := httptest.NewRequest("POST", racePath+path, strings.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+operator)
			response := httptest.NewRecorder()
			h.ServeHTTP(response, req)
			results <- response.Code
		}(operation.path, operation.body)
	}
	close(start)
	wg.Wait()
	close(results)
	succeeded, conflicted := 0, 0
	for status := range results {
		if status == 200 {
			succeeded++
		} else if status == 409 {
			conflicted++
		} else {
			t.Fatalf("unexpected concurrent transition status: %d", status)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("cancel/admit race did not serialize: succeeded=%d conflicts=%d", succeeded, conflicted)
	}
	raceVisit, err := a.Queries.FindVisit(ctx, raceID)
	if err != nil || raceVisit.Status.EnumVisitsStatus != "active" && raceVisit.Status.EnumVisitsStatus != "cancelled" {
		t.Fatalf("invalid state after cancel/admit race: %v %v", raceVisit.Status, err)
	}
}
func TestConcurrentExitIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, username, password := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, username, password)["accessToken"].(string)
	id := createVisit(t, a, h, "V-98989002", "active", token)
	endpoint := fmt.Sprintf("/api/v1/visits/%d/", id)
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := httptest.NewRequest("POST", endpoint+"intermittent-exit", strings.NewReader(`{}`))
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			codes <- w.Code
		}()
	}
	wg.Wait()
	close(codes)
	successes, conflicts := 0, 0
	for code := range codes {
		if code == 200 {
			successes++
		} else if code == 409 {
			conflicts++
		} else {
			t.Fatal(code)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("both transitions succeeded")
	}
	var count int
	e := a.Pool.QueryRow(context.Background(), `SELECT count(*) FROM "IntermittentLogs" WHERE visit_id=$1 AND re_entry IS NULL`, id).Scan(&count)
	if e != nil || count != 1 {
		t.Fatal("duplicate interval", e)
	}
	status, _ := request(t, h, "POST", endpoint+"reactivate", "{}", token)
	if status != 200 {
		t.Fatal(status)
	}
}
func TestVisitorEditAndPhotoIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, operator, password := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, operator, password)["accessToken"].(string)
	id := createVisit(t, a, h, "V-98989003", "active", token)
	path := "/api/v1/visitors/V-98989003"
	status, _ := request(t, h, "PATCH", path, `{"firstName":"Otro"}`, token)
	if status != 403 {
		t.Fatal("edit without password accepted")
	}
	body, _ := json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "isBlocked": true})
	status, _ = request(t, h, "PATCH", path, string(body), token)
	if status != 403 {
		t.Fatal("operator blocked visitor")
	}
	body, _ = json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "visitId": id, "firstName": "Nombre corregido", "phone": nil})
	status, response := request(t, h, "PATCH", path, string(body), token)
	if status != 200 {
		t.Fatal(status, response)
	}
	var old, new string
	e := a.Pool.QueryRow(context.Background(), `SELECT "oldValue","newValue" FROM "VisitorEditHistories" WHERE "visitId"=$1 AND field='firstName'`, id).Scan(&old, &new)
	if e != nil || !strings.HasPrefix(old, "ENC:") || !strings.HasPrefix(new, "ENC:") {
		t.Fatal("plaintext edit history", e)
	}
	status, response = request(t, h, "GET", path+"?history=true", "", token)
	if status != 200 || len(response["data"].(map[string]any)["history"].([]any)) != 1 {
		t.Fatal("history missing")
	}
	imageData := image.NewRGBA(image.Rect(0, 0, 1, 1))
	imageData.Set(0, 0, color.White)
	var buf bytes.Buffer
	png.Encode(&buf, imageData)
	uri := "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
	body, _ = json.Marshal(map[string]string{"editPassword": a.Config.EditPassword, "photoBase64": uri})
	status, response = request(t, h, "PATCH", path, string(body), token)
	if status != 200 {
		t.Fatal("photo edit", status, response)
	}
	r := httptest.NewRequest("GET", path+"/photo", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("public photo")
	}
	r = httptest.NewRequest("GET", path+"/photo", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "private, no-store" || !bytes.Equal(w.Body.Bytes(), buf.Bytes()) {
		t.Fatal("authenticated photo failed")
	}
}
