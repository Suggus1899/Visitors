package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"net/url"
	"testing"
	"time"
)

func TestReportCaracasAggregation(t *testing.T) {
	start, end, e := monthRange(url.Values{"month": {"9"}, "year": {"2026"}})
	if e != nil || start.UTC().Format(time.RFC3339) != "2026-10-01T04:00:00Z" || end.UTC().Format(time.RFC3339) != "2026-11-01T04:00:00Z" {
		t.Fatal(start, end, e)
	}
	entry, _ := time.Parse(time.RFC3339, "2026-10-05T02:00:00Z") // Sunday night in Caracas, Monday in UTC.
	exit := entry.Add(30 * time.Minute)
	visits := []reportVisit{{VisitorCedula: "fake", Purpose: "Consulta", CheckInTime: pgtype.Timestamptz{Time: entry, Valid: true}, CheckOutTime: pgtype.Timestamptz{Time: exit, Valid: true}, Status: "completed"}}
	report := aggregateReport(visits, start, end, true)
	days := report["byDayOfWeek"].([]map[string]any)
	if days[0]["count"] != 1 || days[1]["count"] != 0 || report["summary"].(map[string]any)["averageDuration"] != float64(30) {
		t.Fatal(report)
	}
	weeks := report["byWeek"].([]map[string]any)
	if weeks[0]["weekStart"] != "2026-10-04" {
		t.Fatal(weeks)
	}
	if _, _, e := monthRange(url.Values{"month": {"12"}}); e == nil {
		t.Fatal("invalid month accepted")
	}
}
func TestQueriesAndReportsIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, name, pw := fixtureUser(t, a, "operador", false)
	token := loginFixture(t, h, name, pw)["accessToken"].(string)
	for _, path := range []string{"/api/v1/visits?search=ab", "/api/v1/visitors?search=á"} {
		if s, r := request(t, h, "GET", path, "", token); s != 400 || r["error"].(map[string]any)["code"] != "SEARCH_TOO_SHORT" {
			t.Fatal(path, s, r)
		}
	}
	ids := []int32{createVisit(t, a, h, "V-98989201", "active", token), createVisit(t, a, h, "V-98989202", "active", token)}
	for i, id := range ids {
		if s, _ := request(t, h, "POST", fmt.Sprintf("/api/v1/visits/%d/checkout", id), "", token); s != 200 {
			t.Fatal(s)
		}
		date := []string{"2086-10-01T03:59:59.999Z", "2086-10-01T04:00:00Z"}[i]
		if _, e := a.Pool.Exec(context.Background(), `UPDATE "Visits" SET check_in_time=$2,check_out_time=$2::timestamptz+interval '30 minutes',exit_time=$2::timestamptz+interval '30 minutes' WHERE id=$1`, id, date); e != nil {
			t.Fatal(e)
		}
	}
	body, _ := json.Marshal(map[string]string{"editPassword": a.Config.EditPassword, "firstName": "NombreBusquedaUnico"})
	if s, r := request(t, h, "PATCH", "/api/v1/visitors/V-98989202", string(body), token); s != 200 {
		t.Fatal(s, r)
	}
	for _, query := range []string{"search=NombreBusquedaUnico", "search=V-98989202", "visitorCedula=V-98989202", "startDate=2086-10-01&endDate=2086-10-01"} {
		s, r := request(t, h, "GET", "/api/v1/visits?"+query, "", token)
		if s != 200 || r["data"].(map[string]any)["total"] != float64(1) {
			t.Fatal("search/date filter", query, s, r)
		}
	}
	for _, path := range []string{"/api/v1/reports/stats?startDate=2086-10-01&endDate=2086-10-31", "/api/v1/reports/stats/monthly?month=9&year=2086"} {
		s, r := request(t, h, "GET", path, "", token)
		if s != 200 || r["data"].(map[string]any)["summary"].(map[string]any)["totalVisits"] != float64(1) {
			t.Fatal(path, s, r)
		}
	}
	if s, r := request(t, h, "GET", "/api/v1/reports/comparison?month=9&year=2086", "", token); s != 200 || r["data"].(map[string]any)["summary"].(map[string]any)["lastMonth"] != float64(1) {
		t.Fatal(s, r)
	}
	for _, path := range []string{"/api/v1/reports/alerts", "/api/v1/visitors?search=NombreBusquedaUnico"} {
		if s, r := request(t, h, "GET", path, "", token); s != 200 {
			t.Fatal(s, r)
		}
	}
}
