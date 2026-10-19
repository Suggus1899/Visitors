package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Suggus1899/Visitors/server-go/internal/config"
)

func TestOperationalBackupCreationRequiresMaintenance(t *testing.T) {
	a := &App{Config: config.Config{Environment: "production", Host: "postgres", Port: "5432", Database: "logmaster_pilot"}}
	recorder := httptest.NewRecorder()
	a.createBackup(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/backups", nil))
	if recorder.Code != http.StatusConflict {
		t.Fatalf("operational backup returned %d: %s", recorder.Code, recorder.Body.String())
	}
}
