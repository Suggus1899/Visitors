package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"testing"
)

func TestUserAdministrationIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, root, rootPassword := fixtureUser(t, a, "root", false)
	_, operator, operatorPassword := fixtureUser(t, a, "operador", false)
	rootToken := loginFixture(t, h, root, rootPassword)["accessToken"].(string)
	operatorToken := loginFixture(t, h, operator, operatorPassword)["accessToken"].(string)
	t.Run("root creates updates and deletes accounts", func(t *testing.T) {
		random, e := security.RandomToken()
		if e != nil {
			t.Fatal(e)
		}
		name := "crud_fixture_" + random[:12]
		body, _ := json.Marshal(map[string]string{"username": name, "email": name + "@example.test", "password": "Created!Safe12Á", "role": "operador"})
		status, response := request(t, h, "POST", "/api/v1/superadmin/users", string(body), rootToken)
		if status != 200 {
			t.Fatal(status, response)
		}
		id := int32(response["data"].(map[string]any)["id"].(float64))
		t.Cleanup(func() {
			if _, e := a.Pool.Exec(context.Background(), `DELETE FROM "Users" WHERE id=$1`, id); e != nil {
				t.Error(e)
			}
		})
		session := loginFixture(t, h, name, "Created!Safe12Á")
		old := session["accessToken"].(string)
		path := fmt.Sprintf("/api/v1/superadmin/users/%d", id)
		if status, response = request(t, h, "PUT", path, `{"role":"auditor","email":"updated@example.test"}`, rootToken); status != 200 {
			t.Fatal(status, response)
		}
		if _, e = a.validateToken(context.Background(), old, false); e == nil {
			t.Fatal("role change kept old session")
		}
		if status, response = request(t, h, "DELETE", path, "", rootToken); status != 200 {
			t.Fatal(status, response)
		}
	})
	t.Run("only root lists users and no hashes returned", func(t *testing.T) {
		for _, token := range []string{"", operatorToken} {
			status, _ := request(t, h, "GET", "/api/v1/superadmin/users", "", token)
			if status != 401 && status != 403 {
				t.Fatal("unauthorized list", status)
			}
		}
		status, response := request(t, h, "GET", "/api/v1/superadmin/users", "", rootToken)
		if status != 200 {
			t.Fatal(status)
		}
		for _, u := range response["data"].([]any) {
			if u.(map[string]any)["password"] != nil {
				t.Fatal("password hash exposed")
			}
		}
	})
	t.Run("root contact update does not require changing its protected role", func(t *testing.T) {
		id, _, _ := fixtureUser(t, a, "root", false)
		path := fmt.Sprintf("/api/v1/superadmin/users/%d", id)
		if status, response := request(t, h, "PUT", path, `{"email":"root-contact@example.test"}`, rootToken); status != 200 {
			t.Fatal(status, response)
		}
		var role, email string
		if e := a.Pool.QueryRow(context.Background(), `SELECT role::text,email FROM "Users" WHERE id=$1`, id).Scan(&role, &email); e != nil || role != "root" || email != "root-contact@example.test" {
			t.Fatal("root contact or role changed incorrectly", role, email, e)
		}
		if status, _ := request(t, h, "PUT", path, `{"role":"operador"}`, rootToken); status != 403 {
			t.Fatal("root role is not protected", status)
		}
	})
	id, username, password := fixtureUser(t, a, "operador", false)
	old := loginFixture(t, h, username, password)["accessToken"].(string)
	path := fmt.Sprintf("/api/v1/superadmin/users/%d/reset-password", id)
	t.Run("root reset validates policy and revokes sessions", func(t *testing.T) {
		status, _ := request(t, h, "POST", path, `{"newPassword":"weak"}`, rootToken)
		if status != 400 {
			t.Fatal("weak password accepted")
		}
		status, _ = request(t, h, "POST", path, `{"newPassword":"RootReset!Safe12Á"}`, rootToken)
		if status != 200 {
			t.Fatal(status)
		}
		if _, e := a.validateToken(context.Background(), old, false); e == nil {
			t.Fatal("old session survived reset")
		}
		newSession := loginFixture(t, h, username, "RootReset!Safe12Á")
		if newSession["user"].(map[string]any)["mustChangePassword"] != true {
			t.Fatal("mandatory change missing")
		}
	})
	t.Run("operator cannot create accounts", func(t *testing.T) {
		status, _ := request(t, h, "POST", "/api/v1/superadmin/users", `{}`, operatorToken)
		if status != 403 {
			t.Fatal(status)
		}
	})
	t.Run("create requires email and policy", func(t *testing.T) {
		status, _ := request(t, h, "POST", "/api/v1/superadmin/users", `{"username":"fixture","role":"operador","password":"Created!Safe12Á"}`, rootToken)
		if status != 400 {
			t.Fatal("missing email accepted")
		}
	})
	t.Run("strict identifiers", func(t *testing.T) {
		status, _ := request(t, h, "DELETE", "/api/v1/superadmin/users/1abc", "", rootToken)
		if status != 400 {
			t.Fatal("partial id accepted")
		}
	})
}
