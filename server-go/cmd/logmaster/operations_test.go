package main

import (
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPasswordFileBounds(t *testing.T) {
	path := filepath.Join(t.TempDir(), "input.password")
	for _, raw := range []string{"", strings.Repeat("x", 201)} {
		if e := os.WriteFile(path, []byte(raw), 0600); e != nil {
			t.Fatal(e)
		}
		if _, e := readPassword(path); e == nil {
			t.Fatal("invalid password file accepted")
		}
	}
	os.WriteFile(path, []byte("Fixture!Password123\n"), 0600)
	raw, e := readPassword(path)
	if e != nil || string(raw) != "Fixture!Password123" {
		t.Fatal(e)
	}
}

func TestRestorePasswordRequiresPrivateSource(t *testing.T) {
	t.Setenv("BACKUP_PASSWORD_PATH", t.TempDir())
	if _, e := restorePassword(config.Config{}, "backup-missing.dump.enc", ""); e == nil {
		t.Fatal("missing private password accepted")
	}
	file := filepath.Join(t.TempDir(), "restore.password")
	if e := os.WriteFile(file, []byte("Fixture!Password123"), 0600); e != nil {
		t.Fatal(e)
	}
	value, e := restorePassword(config.Config{}, "backup-fixture.dump.enc", file)
	if e != nil || string(value) != "Fixture!Password123" {
		t.Fatal(e)
	}
}
func TestMaintenanceRejectsUnknownCommand(t *testing.T) {
	if e := operations([]string{"erase"}); e == nil {
		t.Fatal("unknown command accepted")
	}
}
