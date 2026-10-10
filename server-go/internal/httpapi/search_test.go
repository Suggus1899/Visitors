package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/search"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"net/url"
	"testing"
)

func TestProtectedSearchAndCalendarIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, username, password := fixtureUser(t, a, "root", false)
	token := loginFixture(t, h, username, password)["accessToken"].(string)
	ctx := context.Background()
	cedula := "V-98989701"
	visitID := createVisit(t, a, h, cedula, "active", token)
	visitor, e := a.Queries.FindVisitor(ctx, security.Hash(cedula))
	if e != nil {
		t.Fatal(e)
	}
	edit := func(first string) {
		t.Helper()
		raw, _ := json.Marshal(map[string]any{"editPassword": a.Config.EditPassword, "firstName": first, "lastName": "Ficticio"})
		if status, response := request(t, h, "PATCH", "/api/v1/visitors/"+cedula, string(raw), token); status != 200 {
			t.Fatal(status, response)
		}
	}
	count := func(term string) int {
		t.Helper()
		status, response := request(t, h, "GET", "/api/v1/visitors?search="+url.QueryEscape(term), "", token)
		if status != 200 {
			t.Fatal(status, response)
		}
		return int(response["data"].(map[string]any)["total"].(float64))
	}
	edit("aba prueba bab")
	if count("abab") != 0 {
		t.Fatal("trigram candidate accepted without exact verification")
	}
	edit("Áyala exclusiva")
	if count("ÁYALA EXCLUSIVA") != 1 || count("Ayala exclusiva") != 0 || count("aba prueba bab") != 0 {
		t.Fatal("accent or edit-index mismatch")
	}
	var stored []byte
	if e = a.Pool.QueryRow(ctx, `SELECT token FROM "VisitorSearchTokens" WHERE visitor_id=$1 LIMIT 1`, visitor.ID).Scan(&stored); e != nil || len(stored) != 32 {
		t.Fatal("unprotected index", e)
	}
	if status, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/checkout", visitID), "", token); status != 200 {
		t.Fatal(status)
	}
	if _, e = a.Pool.Exec(ctx, `UPDATE "Visits" SET check_in_time='1999-02-03T02:00:00Z' WHERE id=$1`, visitID); e != nil {
		t.Fatal(e)
	}
	status, response := request(t, h, "GET", "/api/v1/visits/calendar?startDate=1999-02-02&endDate=1999-02-02&status=completed", "", token)
	if status != 200 {
		t.Fatal(status, response)
	}
	days := response["data"].(map[string]any)["days"].([]any)
	if len(days) != 1 || days[0].(map[string]any)["date"] != "1999-02-02" || days[0].(map[string]any)["count"] != float64(1) {
		t.Fatal("calendar not aggregated in Caracas", days)
	}
	sqlDB, e := db.Open(a.Config)
	if e != nil {
		t.Fatal(e)
	}
	defer sqlDB.Close()
	if e = db.Preflight(ctx, sqlDB, make([]byte, 32)); e == nil {
		t.Fatal("wrong identity key accepted")
	}
	if e = db.RebuildSearch(ctx, sqlDB, a.Config.EncryptionKey, true); e != nil {
		t.Fatal(e)
	}
	if count("Áyala exclusiva") != 1 {
		t.Fatal("backfill lost search")
	}
	if status, response = request(t, h, "DELETE", "/api/v1/privacy/subjects/"+cedula, "", token); status != 200 {
		t.Fatal(status, response)
	}
	var remaining int
	if e = a.Pool.QueryRow(ctx, `SELECT count(*) FROM "VisitorSearchTokens" WHERE visitor_id=$1`, visitor.ID).Scan(&remaining); e != nil || remaining != 0 {
		t.Fatal("cancelled index retained", remaining, e)
	}
	if count("Áyala exclusiva") != 0 {
		t.Fatal("cancelled identity searchable")
	}
	if search.Fingerprint(a.Config.EncryptionKey) == search.Fingerprint(make([]byte, 32)) {
		t.Fatal("wrong key fingerprint")
	}
	t.Cleanup(func() {
		a.Pool.Exec(context.Background(), `DELETE FROM "Visits" WHERE visitor_id=$1`, visitor.ID)
		a.Pool.Exec(context.Background(), `DELETE FROM "Visitors" WHERE id=$1`, visitor.ID)
	})
}
