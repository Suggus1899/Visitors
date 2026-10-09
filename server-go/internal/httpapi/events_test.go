package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSSEIntegration(t *testing.T) {
	a, h := integrationApp(t)
	id, name, pw := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, name, pw)["accessToken"].(string)
	if s, _ := request(t, h, "GET", "/api/v1/events/visits?token="+token, "", ""); s != 401 {
		t.Fatal("token in URL allowed", s)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	server := httptest.NewServer(h)
	defer server.Close()
	defer a.StopEvents()
	req, e := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/v1/events/visits", nil)
	if e != nil {
		t.Fatal(e)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	response, e := server.Client().Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	line, e := reader.ReadString('\n')
	if e != nil || !strings.Contains(line, "system:connected") || response.StatusCode != 200 {
		t.Fatal(line, e)
	}
	reader.ReadString('\n')
	a.publish("visit:checked-in", 123)
	line, e = reader.ReadString('\n')
	if e != nil || !strings.Contains(line, "visit:checked-in") {
		t.Fatal(line, e)
	}
	reader.ReadString('\n')
	createVisit(t, a, h, "V-98989510", "active", token)
	if line, e = reader.ReadString('\n'); e != nil || !strings.Contains(line, "visit:checked-in") {
		t.Fatal("checkin not published", line, e)
	}
	reader.ReadString('\n')
	body, _ := json.Marshal(map[string]string{"firstName": "Cambio ficticio", "editPassword": a.Config.EditPassword})
	if s, r := request(t, h, "PATCH", "/api/v1/visitors/V-98989510", string(body), token); s != 200 {
		t.Fatal("edit", s, r)
	}
	if line, e = reader.ReadString('\n'); e != nil || !strings.Contains(line, "visit:visitor-updated") {
		t.Fatal("edit not published", line, e)
	}
	reader.ReadString('\n')
	if _, e = a.Pool.Exec(context.Background(), `UPDATE "Users" SET "mustChangePassword"=true WHERE id=$1`, id); e != nil {
		t.Fatal(e)
	}
	a.publish("visit:checked-out", 123)
	if line, e = reader.ReadString('\n'); e != io.EOF {
		t.Fatal("revoked SSE continued", line, e)
	}
	if s, _ := request(t, h, "GET", "/api/v1/events/visits", "", token); s != 403 {
		t.Fatal("required change bypassed SSE", s)
	}
}
