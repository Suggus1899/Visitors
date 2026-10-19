package httpapi

import (
	"context"
	"fmt"
	"net/url"
	"testing"

	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

func TestVisitSortAllowlistAndStableNullOrdering(t *testing.T) {
	tests := []struct {
		name, field, direction, orderBy string
	}{
		{"default", "", "", "v.check_in_time DESC NULLS LAST, v.id DESC"},
		{"company ascending", "company", "asc", "p.company ASC NULLS LAST, v.id DESC"},
		{"status descending", "status", "desc", "v.status DESC NULLS LAST, v.id DESC"},
		{"entry time ascending", "entry_time", "asc", "v.entry_time ASC NULLS LAST, v.id DESC"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseVisitSort(url.Values{"sortField": {test.field}, "sortDirection": {test.direction}})
			if err != nil {
				t.Fatal(err)
			}
			if got.orderBy != test.orderBy {
				t.Fatalf("order by %q, want %q", got.orderBy, test.orderBy)
			}
		})
	}
}

func TestVisitSortRejectsUnknownFieldsAndDirections(t *testing.T) {
	for _, query := range []url.Values{
		{"sortField": {"company; DROP TABLE Visits"}, "sortDirection": {"asc"}},
		{"sortField": {"status"}, "sortDirection": {"sideways"}},
		{"sortField": {"company", "status"}, "sortDirection": {"asc"}},
	} {
		if _, err := parseVisitSort(query); err == nil {
			t.Fatalf("accepted unsafe sort: %v", query)
		}
	}
}

func TestCompanySortJoinsProfilesOnlyWhenNeeded(t *testing.T) {
	companySort, err := parseVisitSort(url.Values{"sortField": {"company"}})
	if err != nil {
		t.Fatal(err)
	}
	if got := visitFrom(url.Values{}, companySort); got == ` FROM "Visits" v` {
		t.Fatal("company sort did not join visitor profiles")
	}
	dateSort, err := parseVisitSort(url.Values{"sortField": {"arrival_time"}})
	if err != nil {
		t.Fatal(err)
	}
	if got := visitFrom(url.Values{}, dateSort); got != ` FROM "Visits" v` {
		t.Fatal("date sort made an unnecessary visitor join")
	}
}

func TestVisitExportLimits(t *testing.T) {
	for format, want := range map[string]int{"pdf": 2000, "xlsx": 20000} {
		got, err := visitExportLimit(format)
		if err != nil || got != want {
			t.Fatalf("%s limit = %d, %v; want %d", format, got, err, want)
		}
	}
	if _, err := visitExportLimit("csv"); err == nil {
		t.Fatal("unsupported export format accepted")
	}
}

func TestVisitExportAndGlobalSortIntegration(t *testing.T) {
	a, h := integrationApp(t)
	_, operatorName, operatorPassword := fixtureUser(t, a, "operador", false)
	operator := loginFixture(t, h, operatorName, operatorPassword)["accessToken"].(string)
	_, auditorName, auditorPassword := fixtureUser(t, a, "auditor", false)
	auditor := loginFixture(t, h, auditorName, auditorPassword)["accessToken"].(string)
	visits := []struct {
		cedula, company string
	}{
		{cedula: "V-99888101", company: "ExportSortFicticia Zulu"},
		{cedula: "V-99888102", company: "ExportSortFicticia Alfa"},
	}
	for i := range visits {
		createVisit(t, a, h, visits[i].cedula, "waiting", operator)
		hash := security.IdentityHash(a.Config.EncryptionKey, visits[i].cedula)
		_, err := a.Pool.Exec(context.Background(), `UPDATE "Visitors" SET company=$1 WHERE cedula=$2`, visits[i].company, hash)
		if err != nil {
			t.Fatal(err)
		}
	}

	for page, want := range []string{"ExportSortFicticia Alfa", "ExportSortFicticia Zulu"} {
		path := fmt.Sprintf("/api/v1/visits?company=ExportSortFicticia&sortField=company&sortDirection=asc&page=%d&limit=1", page+1)
		status, response := request(t, h, "GET", path, "", auditor)
		if status != 200 {
			t.Fatalf("sorted page %d: %d %v", page+1, status, response)
		}
		data := response["data"].(map[string]any)
		rows := data["visits"].([]any)
		if len(rows) != 1 || rows[0].(map[string]any)["visitorCompany"] != want {
			t.Fatalf("page %d company = %v, want %s", page+1, rows, want)
		}
	}

	status, response := request(t, h, "GET", "/api/v1/visits/export?format=xlsx&company=ExportSortFicticia&sortField=company&sortDirection=asc", "", auditor)
	if status != 200 {
		t.Fatalf("export: %d %v", status, response)
	}
	data := response["data"].(map[string]any)
	rows := data["visits"].([]any)
	if data["total"] != float64(2) || len(rows) != 2 {
		t.Fatalf("export returned total=%v rows=%d", data["total"], len(rows))
	}
	first := rows[0].(map[string]any)
	second := rows[1].(map[string]any)
	if first["visitorCompany"] != "ExportSortFicticia Alfa" || second["visitorCompany"] != "ExportSortFicticia Zulu" {
		t.Fatalf("export order is not global: %v", rows)
	}
	for _, row := range rows {
		for _, photoField := range []string{"photo", "idPhoto", "photoData", "idPhotoData"} {
			if _, exists := row.(map[string]any)[photoField]; exists {
				t.Fatalf("export unexpectedly included %s", photoField)
			}
		}
	}
	if status, _ := request(t, h, "GET", "/api/v1/visits/export?format=pdf&sortField=unknown", "", auditor); status != 400 {
		t.Fatalf("unsafe export sort was accepted: %d", status)
	}
}
