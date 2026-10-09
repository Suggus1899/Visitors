package httpapi

import (
	"context"
	"encoding/csv"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestAuditFilterDatesAndCSV(t *testing.T) {
	start, end, e := dateRange(url.Values{"startDate": {"2026-10-09"}, "endDate": {"2026-10-09"}})
	if e != nil || start.UTC().Format(time.RFC3339) != "2026-10-09T04:00:00Z" || end.Sub(*start) != 24*time.Hour {
		t.Fatal(start, end, e)
	}
	for _, q := range []url.Values{{"startDate": {"bad"}}, {"startDate": {"2026-10-10"}, "endDate": {"2026-10-09"}}} {
		if _, _, e := dateRange(q); e == nil {
			t.Fatal("invalid range accepted")
		}
	}
	for _, value := range []string{"=HYPERLINK(\"x\")", " \t+SUM(1)", "\r@cmd", "-1", "\ufeff=1"} {
		if csvText(value) != "'"+value {
			t.Fatal("active spreadsheet cell", value)
		}
	}
	if csvText("Texto normal") != "Texto normal" {
		t.Fatal("normal text changed")
	}
	f, e := auditFilter(url.Values{"search": {"=1"}, "entity": {"Visitor"}})
	if e != nil || len(f.args) != 2 || strings.Contains(f.where(), "=1") {
		t.Fatal("filter interpolation", f, e)
	}
}
func TestAuditExportsIntegration(t *testing.T) {
	a, h := integrationApp(t)
	id, name, password := fixtureUser(t, a, "auditor", false)
	token := loginFixture(t, h, name, password)["accessToken"].(string)
	ctx := context.Background()
	for _, entity := range []string{"Visitor", "Visit"} {
		if _, e := a.Pool.Exec(ctx, `INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",details,"ipAddress","createdAt") VALUES($1,$2,'CSV_FIXTURE',$3,'=1',$4,'127.0.0.7','2026-10-09T04:00:00Z')`, id, name, entity, " \t@cmd"); e != nil {
			t.Fatal(e)
		}
	}
	query := "?action=CSV_FIXTURE&entity=Visitor&ip=127.0.0.7&search=" + url.QueryEscape("=1") + "&startDate=2026-10-09&endDate=2026-10-09&username=" + url.QueryEscape(name)
	s, response := request(t, h, "GET", "/api/v1/audit/logs"+query, "", token)
	if s != 200 || response["data"].(map[string]any)["pagination"].(map[string]any)["total"] != float64(1) {
		t.Fatal(s, response)
	}
	r := httptest.NewRequest("GET", "/api/v1/audit/export"+query, nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	rows, e := csv.NewReader(strings.NewReader(strings.TrimPrefix(w.Body.String(), "\ufeff"))).ReadAll()
	if e != nil || w.Code != 200 || len(rows) != 2 || rows[1][5] != "'=1" || rows[1][6] != "' \t@cmd" {
		t.Fatal("export filters or formula guard", w.Code, rows, e)
	}
	for _, path := range []string{"stats", "actions", "users", "config"} {
		if s, r := request(t, h, "GET", "/api/v1/audit/"+path, "", token); s != 200 {
			t.Fatal(path, s, r)
		}
	}
}
