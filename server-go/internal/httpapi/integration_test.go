package httpapi

import (
	"context"
	"encoding/json"
	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func integrationApp(t *testing.T) (*App, http.Handler) {
	t.Helper()
	if os.Getenv("LOGMASTER_DB_TEST") != "true" {
		t.Skip("requires explicit isolated database integration")
	}
	c, e := config.Load()
	if e != nil {
		t.Fatal(e)
	}
	if !c.LocalTest() || c.Database != "logmaster_go_test" {
		t.Fatal("integration requires independent logmaster_go_test")
	}
	sqlDB, e := db.Open(c)
	if e != nil {
		t.Fatal(e)
	}
	defer sqlDB.Close()
	if e = db.Check(context.Background(), sqlDB, c.EncryptionKey); e != nil {
		t.Fatal(e)
	}
	a, e := New(context.Background(), c)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(a.Pool.Close)
	return a, a.Router()
}
func request(t *testing.T, h http.Handler, method, path, body, token string) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:5678"
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var result map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &result); e != nil {
		t.Fatalf("non-JSON response %d: %s", w.Code, w.Body.String())
	}
	return w.Code, result
}
func fixtureUser(t *testing.T, a *App, role string, mustChange bool) (int32, string, string) {
	t.Helper()
	random, e := security.RandomToken()
	if e != nil {
		t.Fatal(e)
	}
	username := "go_fixture_" + random[:12]
	password := "Fixture!Safe12Á"
	hash, e := bcrypt.GenerateFromPassword([]byte(password), 4)
	if e != nil {
		t.Fatal(e)
	}
	var id int32
	e = a.Pool.QueryRow(context.Background(), `INSERT INTO "Users"(username,password,role,email,"mustChangePassword","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,now(),now()) RETURNING id`, username, string(hash), role, username+"@example.test", mustChange).Scan(&id)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		_, e := a.Pool.Exec(context.Background(), `DELETE FROM "ActivityLogs" WHERE "userId"=$1`, id)
		if e != nil {
			t.Error(e)
		}
		_, e = a.Pool.Exec(context.Background(), `DELETE FROM "Users" WHERE id=$1`, id)
		if e != nil {
			t.Error(e)
		}
	})
	return id, username, password
}
func loginFixture(t *testing.T, h http.Handler, username, password string) map[string]any {
	t.Helper()
	b, _ := json.Marshal(map[string]string{"username": username, "password": password})
	status, response := request(t, h, "POST", "/api/v1/auth/login", string(b), "")
	if status != 200 {
		t.Fatalf("login: %d %v", status, response)
	}
	return response["data"].(map[string]any)
}

func TestHTTPFoundationIntegration(t *testing.T) {
	_, h := integrationApp(t)
	status, result := request(t, h, "GET", "/api/v1/health", "", "")
	if status != 200 || result["success"] != true {
		t.Fatal("health failed")
	}
	server := httptest.NewServer(h)
	response, e := http.Get(server.URL + "/api/v1/health")
	if e != nil {
		t.Fatal(e)
	}
	response.Body.Close()
	server.Close()
	if response.StatusCode != 200 {
		t.Fatal("real HTTP server failed")
	}
}
func TestAuthenticationIntegration(t *testing.T) {
	a, h := integrationApp(t)
	id, username, password := fixtureUser(t, a, "operador", true)
	result := loginFixture(t, h, username, password)
	access := result["accessToken"].(string)
	refresh := result["refreshToken"].(string)
	t.Run("login actor", func(t *testing.T) {
		var actor int32
		if e := a.Pool.QueryRow(context.Background(), `SELECT "userId" FROM "ActivityLogs" WHERE "userId"=$1 AND action='LOGIN'`, id).Scan(&actor); e != nil || actor != id {
			t.Fatal("login not attributed", e)
		}
	})
	t.Run("must change checked after authentication", func(t *testing.T) {
		s, e := a.validateToken(context.Background(), access, false)
		if e != nil || !s.MustChange {
			t.Fatal("session missing restriction")
		}
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/protected", nil)
		r.Header.Set("Authorization", "Bearer "+access)
		a.authenticate(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("restricted operation allowed") })).ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
		status, response := request(t, h, "GET", "/api/v1/auth/session", "", access)
		user, ok := response["data"].(map[string]any)["user"].(map[string]any)
		if status != 200 || !ok || user["username"] != username || user["role"] != "operador" || user["mustChangePassword"] != true {
			t.Fatalf("session endpoint must expose only the current user state: %d %v", status, response)
		}
	})
	t.Run("password change revokes both sessions persistently", func(t *testing.T) {
		b, _ := json.Marshal(map[string]string{"currentPassword": password, "newPassword": "Changed!Safe12Á"})
		status, response := request(t, h, "POST", "/api/v1/auth/change-password", string(b), access)
		if status != 200 {
			t.Fatalf("change: %d %v", status, response)
		}
		if _, e := a.validateToken(context.Background(), access, false); e == nil {
			t.Fatal("old access accepted")
		}
		status, _ = request(t, h, "POST", "/api/v1/auth/refresh", `{"refreshToken":"`+refresh+`"}`, "")
		if status != 401 {
			t.Fatal("old refresh accepted")
		}
		restarted, e := New(context.Background(), a.Config)
		if e != nil {
			t.Fatal(e)
		}
		defer restarted.Pool.Close()
		if _, e = restarted.validateToken(context.Background(), access, false); e == nil {
			t.Fatal("old session accepted after restart")
		}
	})
}
func TestRecoveryIntegration(t *testing.T) {
	a, h := integrationApp(t)
	id, username, _ := fixtureUser(t, a, "operador", false)
	for _, name := range []string{username, "absent_go_fixture"} {
		status, response := request(t, h, "POST", "/api/v1/auth/forgot-password", `{"username":"`+name+`"}`, "")
		if status != 200 || response["data"].(map[string]any)["token"] != nil {
			t.Fatal("recovery response exposes existence or token")
		}
	}
	var hash string
	if e := a.Pool.QueryRow(context.Background(), `SELECT "resetToken" FROM "Users" WHERE id=$1`, id).Scan(&hash); e != nil || len(hash) != 64 {
		t.Fatal("reset token not stored as hash", e)
	}
	response, e := http.Get("http://127.0.0.1:8025/api/v1/messages")
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	var mailbox struct {
		Messages []struct {
			ID string `json:"ID"`
			To []struct {
				Address string `json:"Address"`
			} `json:"To"`
		} `json:"messages"`
	}
	if e = json.NewDecoder(response.Body).Decode(&mailbox); e != nil {
		t.Fatal(e)
	}
	found := ""
	for _, message := range mailbox.Messages {
		for _, recipient := range message.To {
			if recipient.Address == username+"@example.test" {
				found = message.ID
			}
		}
	}
	if found == "" {
		t.Fatal("Mailpit did not receive recovery")
	}
	mailResponse, e := http.Get("http://127.0.0.1:8025/api/v1/message/" + found)
	if e != nil {
		t.Fatal(e)
	}
	defer mailResponse.Body.Close()
	var message struct {
		Text string `json:"Text"`
	}
	if e = json.NewDecoder(mailResponse.Body).Decode(&message); e != nil {
		t.Fatal(e)
	}
	i := strings.Index(message.Text, "token=")
	if i < 0 {
		t.Fatal("missing reset link")
	}
	token := strings.TrimSpace(message.Text[i+6:])
	if security.Hash(token) != hash {
		t.Fatal("email token differs")
	}
	body := `{"token":"` + token + `","newPassword":"Recovery!Safe12Á"}`
	status, _ := request(t, h, "POST", "/api/v1/auth/reset-password", body, "")
	if status != 200 {
		t.Fatal("reset failed", status)
	}
	status, _ = request(t, h, "POST", "/api/v1/auth/reset-password", body, "")
	if status != 400 {
		t.Fatal("reused token accepted")
	}
	expired, _ := security.RandomToken()
	_, e = a.Pool.Exec(context.Background(), `UPDATE "Users" SET "resetToken"=$2,"resetTokenExpiry"=$3 WHERE id=$1`, id, security.Hash(expired), time.Now().Add(-time.Minute))
	if e != nil {
		t.Fatal(e)
	}
	status, _ = request(t, h, "POST", "/api/v1/auth/reset-password", `{"token":"`+expired+`","newPassword":"Expired!Safe12Á"}`, "")
	if status != 400 {
		t.Fatal("expired token accepted")
	}
}

func TestLogoutRevokesAllSessionsIntegration(t *testing.T) {
	a, h := integrationApp(t)
	ids := make([]int32, 0, 2)
	accessTokens := make([]string, 0, 2)
	refreshTokens := make([]string, 0, 2)
	for i := 0; i < 2; i++ {
		id, username, password := fixtureUser(t, a, "operador", true)
		ids = append(ids, id)
		data := loginFixture(t, h, username, password)
		access := data["accessToken"].(string)
		accessTokens = append(accessTokens, access)
		refresh := data["refreshToken"].(string)
		refreshTokens = append(refreshTokens, refresh)
		if i == 1 {
			refresh = "expired-refresh-fixture"
		}
		body, _ := json.Marshal(map[string]string{"accessToken": access, "refreshToken": refresh})
		status, response := request(t, h, "POST", "/api/v1/auth/logout", string(body), "")
		if status != 200 || response["data"].(map[string]any)["revoked"] != true {
			t.Fatalf("logout %d: %d %v", i, status, response)
		}
		if _, err := a.validateToken(context.Background(), access, false); err == nil {
			t.Fatal("logout left access token valid")
		}
		if _, err := a.validateToken(context.Background(), refreshTokens[i], true); err == nil {
			t.Fatal("logout left refresh token valid")
		}
	}
	restarted, err := New(context.Background(), a.Config)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Pool.Close()
	for _, id := range ids {
		var count int
		if err = a.Pool.QueryRow(context.Background(), `SELECT count(*) FROM "ActivityLogs" WHERE "userId"=$1 AND action='LOGOUT'`, id).Scan(&count); err != nil || count != 1 {
			t.Fatalf("logout audit for %d: %d %v", id, count, err)
		}
	}
	for _, token := range accessTokens {
		if _, err = restarted.validateToken(context.Background(), token, false); err == nil {
			t.Fatal("access revocation did not survive restart")
		}
	}
	for _, token := range refreshTokens {
		if _, err = restarted.validateToken(context.Background(), token, true); err == nil {
			t.Fatal("refresh revocation did not survive restart")
		}
	}
}

func TestLogoutAuditFailureRollsBackRevocationIntegration(t *testing.T) {
	a, h := integrationApp(t)
	id, username, password := fixtureUser(t, a, "operador", false)
	data := loginFixture(t, h, username, password)
	access := data["accessToken"].(string)
	refresh := data["refreshToken"].(string)
	ctx := context.Background()
	_, err := a.Pool.Exec(ctx, `CREATE FUNCTION go_fixture_reject_logout_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='LOGOUT' THEN RAISE EXCEPTION 'injected logout audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER go_fixture_reject_logout_audit BEFORE INSERT ON "ActivityLogs" FOR EACH ROW EXECUTE FUNCTION go_fixture_reject_logout_audit()`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := a.Pool.Exec(ctx, `DROP TRIGGER IF EXISTS go_fixture_reject_logout_audit ON "ActivityLogs"; DROP FUNCTION IF EXISTS go_fixture_reject_logout_audit()`); err != nil {
			t.Error(err)
		}
	})
	body, _ := json.Marshal(map[string]string{"accessToken": access, "refreshToken": refresh})
	status, _ := request(t, h, "POST", "/api/v1/auth/logout", string(body), "")
	if status != 500 {
		t.Fatalf("expected injected audit failure, got %d", status)
	}
	if _, err = a.validateToken(ctx, access, false); err != nil {
		t.Fatal("failed logout revoked access session", err)
	}
	if _, err = a.validateToken(ctx, refresh, true); err != nil {
		t.Fatal("failed logout revoked refresh session", err)
	}
	var count int
	if err = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "ActivityLogs" WHERE "userId"=$1 AND action='LOGOUT'`, id).Scan(&count); err != nil || count != 0 {
		t.Fatal("failed logout left audit event", count, err)
	}
}
