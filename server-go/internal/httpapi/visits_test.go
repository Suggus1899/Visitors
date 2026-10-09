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
		_, e := a.Pool.Exec(context.Background(), `DELETE FROM "VisitorEditHistories" WHERE "visitorId" IN (SELECT id FROM "Visitors" WHERE cedula=$1)`, security.Hash(cedula))
		if e != nil {
			t.Error(e)
		}
		_, e = a.Pool.Exec(context.Background(), `DELETE FROM "Visits" WHERE visitor_cedula=$1`, security.Hash(cedula))
		if e != nil {
			t.Error(e)
		}
		_, e = a.Pool.Exec(context.Background(), `DELETE FROM "Visitors" WHERE cedula=$1`, security.Hash(cedula))
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
