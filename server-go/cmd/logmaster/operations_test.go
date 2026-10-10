package main

import (
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
func TestMaintenanceRejectsUnknownCommand(t *testing.T) {
	if e := operations([]string{"erase"}); e == nil {
		t.Fatal("unknown command accepted")
	}
}
