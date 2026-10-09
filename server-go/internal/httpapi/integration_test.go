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
	if e = db.Check(context.Background(), sqlDB); e != nil {
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
