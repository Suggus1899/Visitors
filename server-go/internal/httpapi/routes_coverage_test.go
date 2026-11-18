package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"net/http"
	"net/http/httptest"
	"testing"
)

func data(t *testing.T, response map[string]any) any {
	t.Helper()
	value, ok := response["data"]
	if !ok {
		t.Fatalf("response without data: %v", response)
	}
	return value
}

func listHasID(items any, id int32) bool {
	for _, item := range items.([]any) {
		if int32(item.(map[string]any)["id"].(float64)) == id {
			return true
		}
	}
	return false
}

func TestAuditReadRoutesIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, auditor, auditorPassword := fixtureUser(t, a, "auditor", false)
	_, operator, operatorPassword := fixtureUser(t, a, "operador", false)
	_, root, rootPassword := fixtureUser(t, a, "root", false)
	auditorToken := loginFixture(t, h, auditor, auditorPassword)["accessToken"].(string)
	operatorToken := loginFixture(t, h, operator, operatorPassword)["accessToken"].(string)
	rootToken := loginFixture(t, h, root, rootPassword)["accessToken"].(string)

	status, response := request(t, h, "GET", "/api/v1/audit/stats", "", auditorToken)
	if status != 200 {
		t.Fatal("stats", status, response)
	}
	stats := data(t, response).(map[string]any)
	if today, ok := stats["today"].(map[string]any); !ok || today["logins"] == nil {
		t.Fatal("stats without today", stats)
	}
	week, _ := stats["lastWeek"].(map[string]any)
	for _, key := range []string{"actionsByType", "topUsers", "dailyActivity"} {
		if _, ok := week[key]; !ok {
			t.Fatal("stats without", key, stats)
		}
	}
	for path, want := range map[string]string{"/api/v1/audit/actions": "LOGIN", "/api/v1/audit/users": auditor} {
		status, response = request(t, h, "GET", path, "", auditorToken)
		if status != 200 {
			t.Fatal(path, status, response)
		}
		found := false
		for _, value := range data(t, response).([]any) {
			found = found || value == want
		}
		if !found {
			t.Fatalf("%s does not list %q", path, want)
		}
	}
	status, response = request(t, h, "GET", "/api/v1/audit/config", "", auditorToken)
	if status != 200 || data(t, response).(map[string]any)["retentionDays"] == nil {
		t.Fatal("config", status, response)
	}
	for _, path := range []string{"/api/v1/audit/stats", "/api/v1/audit/actions", "/api/v1/audit/users", "/api/v1/audit/config"} {
		if status, _ = request(t, h, "GET", path, "", operatorToken); status != 403 {
			t.Fatal("operator reads audit", path, status)
		}
	}
	if status, _ = request(t, h, "GET", "/api/v1/superadmin/audit-logs", "", auditorToken); status != 403 {
		t.Fatal("auditor reads superadmin audit", status)
	}
	if status, response = request(t, h, "GET", "/api/v1/superadmin/audit-logs", "", rootToken); status != 200 {
		t.Fatal("superadmin audit", status, response)
	}
}

func TestVisitStatusListsAndAliasesIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, operator, password := fixtureUser(t, a, "operador", false)
	_, auditor, auditorPassword := fixtureUser(t, a, "auditor", false)
	token := loginFixture(t, h, operator, password)["accessToken"].(string)
	auditorToken := loginFixture(t, h, auditor, auditorPassword)["accessToken"].(string)

	lists := func(want string, id int32) {
		t.Helper()
		for _, list := range []string{"waiting", "active", "intermittent", "cancelled"} {
			status, response := request(t, h, "GET", "/api/v1/visits/"+list, "", auditorToken)
			if status != 200 {
				t.Fatal(list, status, response)
			}
			if got := listHasID(data(t, response), id); got != (list == want) {
				t.Fatalf("visit %d in %s list = %v, expected only in %s", id, list, got, want)
			}
		}
	}
	waiting := createVisit(t, a, h, "V-98989201", "waiting", token)
	lists("waiting", waiting)
	if status, response := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/cancel", waiting), `{"reason":"Prueba de cancelación"}`, token); status != 200 {
		t.Fatal("cancel", status, response)
	}
	status, response := request(t, h, "GET", "/api/v1/visits/cancelled", "", auditorToken)
	if status != 200 || !listHasID(data(t, response), waiting) {
		t.Fatal("cancelled list", status, response)
	}

	active := createVisit(t, a, h, "V-98989202", "active", token)
	lists("active", active)
	endpoint := fmt.Sprintf("/api/v1/visits/%d/", active)
	if status, response = request(t, h, "POST", endpoint+"intermittent", `{"notes":"Salida por alias"}`, token); status != 200 {
		t.Fatal("intermittent alias", status, response)
	}
	lists("intermittent", active)
	if status, response = request(t, h, "POST", endpoint+"reactivate", "{}", token); status != 200 {
		t.Fatal("reactivate alias", status, response)
	}
	lists("active", active)
	if status, _ = request(t, h, "POST", endpoint+"intermittent", "{}", auditorToken); status != 403 {
		t.Fatal("auditor changed a visit", status)
	}

	status, response = request(t, h, "GET", endpoint+"edit-history", "", auditorToken)
	if status != 200 {
		t.Fatal("visit edit history", status, response)
	}
	if items := data(t, response).([]any); len(items) != 0 {
		t.Fatal("unexpected history", items)
	}
	if status, _ = request(t, h, "GET", "/api/v1/visits/abc/edit-history", "", auditorToken); status != 400 {
		t.Fatal("invalid visit id accepted", status)
	}
}

func TestVisitorSupportRoutesIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, operator, password := fixtureUser(t, a, "operador", false)
	_, auditor, auditorPassword := fixtureUser(t, a, "auditor", false)
	token := loginFixture(t, h, operator, password)["accessToken"].(string)
	auditorToken := loginFixture(t, h, auditor, auditorPassword)["accessToken"].(string)
	createVisit(t, a, h, "V-98989203", "active", token)

	status, response := request(t, h, "GET", "/api/v1/visitors/companies?q=ficticia", "", token)
	if status != 200 {
		t.Fatal("companies", status, response)
	}
	found := false
	for _, company := range data(t, response).([]any) {
		found = found || company == "Empresa ficticia"
	}
	if !found {
		t.Fatal("company suggestion missing", response)
	}

	right, _ := json.Marshal(map[string]string{"password": a.Config.EditPassword})
	for _, c := range []struct {
		body  string
		valid bool
	}{{string(right), true}, {`{"password":"no-es-la-clave"}`, false}} {
		status, response = request(t, h, "POST", "/api/v1/visitors/verify-edit-password", c.body, token)
		if status != 200 || data(t, response).(map[string]any)["valid"] != c.valid {
			t.Fatal("verify edit password", c.valid, status, response)
		}
	}
	if status, _ = request(t, h, "POST", "/api/v1/visitors/verify-edit-password", `{"password":""}`, token); status != 400 {
		t.Fatal("empty edit password accepted", status)
	}
	if status, _ = request(t, h, "POST", "/api/v1/visitors/verify-edit-password", string(right), auditorToken); status != 403 {
		t.Fatal("auditor verified edit password", status)
	}

	for _, path := range []string{"/api/v1/visitors/V-98989203/photo", "/api/v1/visitors/V-98989203/id-photo"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatal("missing photo", path, w.Code, w.Body.String())
		}
	}
}

func TestArcoOppositionAndStatusIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, operator, password := fixtureUser(t, a, "operador", false)
	_, admin, adminPassword := fixtureUser(t, a, "admin", false)
	token := loginFixture(t, h, operator, password)["accessToken"].(string)
	adminToken := loginFixture(t, h, admin, adminPassword)["accessToken"].(string)
	createVisit(t, a, h, "V-98989204", "active", token)
	t.Cleanup(func() {
		hash := security.IdentityHash(a.Config.EncryptionKey, "V-98989204")
		if _, e := a.Pool.Exec(context.Background(), `DELETE FROM "ArcoRequests" WHERE "subjectCedulaHash"=$1`, hash); e != nil {
			t.Error(e)
		}
	})

	status, response := request(t, h, "POST", "/api/v1/privacy/subjects/V-98989204/opposition", `{"requestedByName":"Titular ficticio","reason":"Me opongo al tratamiento"}`, token)
	if status != 201 && status != 200 {
		t.Fatal("opposition", status, response)
	}
	created := data(t, response).(map[string]any)
	if created["requestType"] != "opposition" || created["status"] != "pending" {
		t.Fatal("opposition request", created)
	}
	path := fmt.Sprintf("/api/v1/privacy/arco-requests/%d/status", int32(created["id"].(float64)))
	if status, _ = request(t, h, "PATCH", path, `{"status":"in_progress"}`, token); status != 403 {
		t.Fatal("operator changed ARCO status", status)
	}
	if status, _ = request(t, h, "PATCH", path, `{"status":"archivada"}`, adminToken); status != 400 {
		t.Fatal("unknown ARCO status accepted", status)
	}
	for _, next := range []string{"in_progress", "completed"} {
		status, response = request(t, h, "PATCH", path, fmt.Sprintf(`{"status":%q,"resolutionNotes":"Atendida en prueba"}`, next), adminToken)
		if status != 200 || data(t, response).(map[string]any)["status"] != next {
			t.Fatal("ARCO status", next, status, response)
		}
	}
	var resolved bool
	var audited int
	id := int32(created["id"].(float64))
	if e := a.Pool.QueryRow(context.Background(), `SELECT "resolvedAt" IS NOT NULL FROM "ArcoRequests" WHERE id=$1`, id).Scan(&resolved); e != nil || !resolved {
		t.Fatal("completed request without resolvedAt", e)
	}
	if e := a.Pool.QueryRow(context.Background(), `SELECT count(*) FROM "ActivityLogs" WHERE action='ARCO_REQUEST_STATUS_UPDATED' AND "entityId"=$1`, fmt.Sprint(id)).Scan(&audited); e != nil || audited != 2 {
		t.Fatal("ARCO status changes not audited", audited, e)
	}
	if status, _ = request(t, h, "PATCH", "/api/v1/privacy/arco-requests/999999999/status", `{"status":"rejected"}`, adminToken); status != 404 {
		t.Fatal("missing ARCO request", status)
	}
}

func TestSuperAdminAccountLifecycleIntegration(t *testing.T) {
	a, h := integrationApp(t)
	rootID, root, rootPassword := fixtureUser(t, a, "root", false)
	rootToken := loginFixture(t, h, root, rootPassword)["accessToken"].(string)
	random, e := security.RandomToken()
	if e != nil {
		t.Fatal(e)
	}
	name := "life_fixture_" + random[:12]
	initial := "Initial!Safe12Á"
	body, _ := json.Marshal(map[string]string{"username": name, "email": name + "@example.test", "password": initial, "role": "admin"})
	status, response := request(t, h, "POST", "/api/v1/superadmin/users", string(body), rootToken)
	if status != 200 {
		t.Fatal("create", status, response)
	}
	id := int32(data(t, response).(map[string]any)["id"].(float64))
	t.Cleanup(func() {
		a.Pool.Exec(context.Background(), `DELETE FROM "Users" WHERE id=$1`, id)
	})
	if status, _ = request(t, h, "POST", "/api/v1/superadmin/users", string(body), rootToken); status != 409 {
		t.Fatal("duplicate username accepted", status)
	}

	t.Run("new account must change its password before working", func(t *testing.T) {
		session := loginFixture(t, h, name, initial)
		if session["user"].(map[string]any)["mustChangePassword"] != true {
			t.Fatal("new account without mandatory change")
		}
		token := session["accessToken"].(string)
		if status, _ := request(t, h, "GET", "/api/v1/visits/active", "", token); status != 403 {
			t.Fatal("pending password change allowed work", status)
		}
		changed := "Changed!Safe34Á"
		change, _ := json.Marshal(map[string]string{"currentPassword": initial, "newPassword": changed, "confirmPassword": changed})
		if status, response := request(t, h, "POST", "/api/v1/auth/change-password", string(change), token); status != 200 {
			t.Fatal("change password", status, response)
		}
		token = loginFixture(t, h, name, changed)["accessToken"].(string)
		if status, _ := request(t, h, "GET", "/api/v1/visits/active", "", token); status != 200 {
			t.Fatal("account cannot work after changing password", status)
		}
		old, _ := json.Marshal(map[string]string{"username": name, "password": initial})
		if status, _ := request(t, h, "POST", "/api/v1/auth/login", string(old), ""); status != 401 {
			t.Fatal("old password still works", status)
		}
	})

	t.Run("root reset replaces the password", func(t *testing.T) {
		path := fmt.Sprintf("/api/v1/superadmin/users/%d/reset-password", id)
		if status, response := request(t, h, "POST", path, `{"newPassword":"Reset!Safe56Á"}`, rootToken); status != 200 {
			t.Fatal("reset", status, response)
		}
		if loginFixture(t, h, name, "Reset!Safe56Á")["user"].(map[string]any)["mustChangePassword"] != true {
			t.Fatal("reset without mandatory change")
		}
		if status, _ := request(t, h, "POST", "/api/v1/superadmin/users/999999999/reset-password", `{"newPassword":"Reset!Safe56Á"}`, rootToken); status != 404 {
			t.Fatal("reset of missing account", status)
		}
	})

	t.Run("root accounts cannot be deleted", func(t *testing.T) {
		if status, response := request(t, h, "DELETE", fmt.Sprintf("/api/v1/superadmin/users/%d", rootID), "", rootToken); status != 403 {
			t.Fatal("root deleted", status, response)
		}
	})

	t.Run("deleted account loses access and leaves an audit entry", func(t *testing.T) {
		token := loginFixture(t, h, name, "Reset!Safe56Á")["accessToken"].(string)
		path := fmt.Sprintf("/api/v1/superadmin/users/%d", id)
		if status, response := request(t, h, "DELETE", path, "", rootToken); status != 200 {
			t.Fatal("delete", status, response)
		}
		if status, _ := request(t, h, "DELETE", path, "", rootToken); status != 404 {
			t.Fatal("second delete", status)
		}
		if status, _ := request(t, h, "GET", "/api/v1/auth/session", "", token); status != 401 {
			t.Fatal("deleted account kept its session", status)
		}
		login, _ := json.Marshal(map[string]string{"username": name, "password": "Reset!Safe56Á"})
		if status, _ := request(t, h, "POST", "/api/v1/auth/login", string(login), ""); status != 401 {
			t.Fatal("deleted account can log in", status)
		}
		var audited int
		if e := a.Pool.QueryRow(context.Background(), `SELECT count(*) FROM "ActivityLogs" WHERE action='SUPERADMIN_DELETE_USER' AND "entityId"=$1`, fmt.Sprint(id)).Scan(&audited); e != nil || audited != 1 {
			t.Fatal("delete not audited", audited, e)
		}
		status, response := request(t, h, "GET", "/api/v1/superadmin/users", "", rootToken)
		if status != 200 || listHasID(data(t, response), id) {
			t.Fatal("deleted account still listed", status)
		}
	})
}
