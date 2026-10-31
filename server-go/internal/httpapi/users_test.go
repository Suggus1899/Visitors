package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/jackc/pgx/v5/pgtype"
	"testing"
	"time"
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
		user, err := a.Queries.FindUserByID(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = a.Pool.Exec(context.Background(), `UPDATE "Users" SET "resetToken"='old-reset-hash',"resetTokenExpiry"=now()+interval '15 minutes' WHERE id=$1`, id); err != nil {
			t.Fatal(err)
		}
		if status, response := request(t, h, "PUT", path, `{"email":"root-contact@example.test"}`, rootToken); status != 200 {
			t.Fatal(status, response)
		}
		var role, email string
		var resetToken *string
		var version int32
		if err := a.Pool.QueryRow(context.Background(), `SELECT role::text,email,"resetToken","tokenVersion" FROM "Users" WHERE id=$1`, id).Scan(&role, &email, &resetToken, &version); err != nil || role != "root" || email != "root-contact@example.test" || resetToken != nil {
			t.Fatal("contact update did not invalidate old recovery links", role, email, resetToken, err)
		}
		if _, err := a.Queries.SaveResetToken(context.Background(), store.SaveResetTokenParams{ID: id, Email: user.Email, TokenVersion: user.TokenVersion, ResetToken: text("late-old-token"), ResetTokenExpiry: pgtype.Timestamptz{Time: time.Now().Add(15 * time.Minute), Valid: true}}); err != nil {
			t.Fatal(err)
		}
		if err := a.Pool.QueryRow(context.Background(), `SELECT "resetToken" FROM "Users" WHERE id=$1`, id).Scan(&resetToken); err != nil || resetToken != nil {
			t.Fatal("stale recovery request reinstated a token after the email change", resetToken, err)
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
