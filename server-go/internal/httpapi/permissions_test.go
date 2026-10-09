package httpapi

import (
	"encoding/json"
	"testing"
)

func TestRoleMatrixIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, name, pw := fixtureUser(t, a, "operador", false)
	operator := loginFixture(t, h, name, pw)["accessToken"].(string)
	createVisit(t, a, h, "V-98989102", "active", operator)
	body, _ := json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "firstName": "Visitante"})
	block, _ := json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "isBlocked": false})
	for _, role := range []string{"root", "admin", "operador", "auditor", "demo"} {
		t.Run(role, func(t *testing.T) {
			_, name, pw := fixtureUser(t, a, role, false)
			token := loginFixture(t, h, name, pw)["accessToken"].(string)
			for _, path := range []string{"/api/v1/visitors/V-98989102", "/api/v1/visitors/V-98989102/edit-history", "/api/v1/visits/active"} {
				if s, _ := request(t, h, "GET", path, "", token); s != 200 {
					t.Fatal("read access", path, s)
				}
			}
			expected := 200
			if role == "auditor" || role == "demo" {
				expected = 403
			}
			if s, _ := request(t, h, "PATCH", "/api/v1/visitors/V-98989102", string(body), token); s != expected {
				t.Fatal("edit role", s, expected)
			}
			expected = 403
			if role == "root" || role == "admin" {
				expected = 200
			}
			if s, _ := request(t, h, "PATCH", "/api/v1/visitors/V-98989102", string(block), token); s != expected {
				t.Fatal("block role", s, expected)
			}
			expected = 403
			if role == "root" {
				expected = 200
			}
			if s, _ := request(t, h, "GET", "/api/v1/superadmin/users", "", token); s != expected {
				t.Fatal("accounts role", s)
			}
			expected = 403
			if role == "root" || role == "admin" || role == "auditor" {
				expected = 200
			}
			if s, _ := request(t, h, "GET", "/api/v1/privacy/subjects/V-98989102", "", token); s != expected {
				t.Fatal("privacy read role", s)
			}
		})
	}
}
