package config

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/joho/godotenv"
)

func TestContainerSeedGuard(t *testing.T) {
	c := Config{Host: "postgres", Port: "5432", Database: "logmaster_pilot", Environment: "development"}
	if !c.LocalDevelopment() {
		t.Fatal("fictitious container pilot rejected")
	}
	c.Environment = "production"
	if c.LocalDevelopment() {
		t.Fatal("production seeding allowed")
	}
	c.Environment = "development"
	c.Database = "company"
	if c.LocalDevelopment() {
		t.Fatal("arbitrary container database allowed")
	}
}

func TestGeneratedContainerCredentialsSeparateRoles(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux configuration check")
	}
	for _, tool := range []string{"sh", "openssl"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Fatalf("Linux configuration check requires %s", tool)
		}
	}
	directory := filepath.Join(t.TempDir(), "private")
	command := exec.Command("sh", "../../../deploy/scripts/configure.sh")
	command.Env = append(os.Environ(), "LOGMASTER_CONFIG_DIR="+directory)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("configure: %v: %s", err, output)
	}
	for _, database := range []struct {
		name, runtime, maintenance, backup string
	}{
		{"logmaster_pilot", "app.env", "maintenance.env", "backup.env"},
		{"logmaster_load_test", "load-runtime.env", "load.env", "load-backup.env"},
	} {
		passwords := map[string]bool{}
		for _, role := range []struct{ file, user, secret string }{
			{database.runtime, "logmaster_runtime", "runtime.db.password"},
			{database.maintenance, database.name, "db.password"},
			{database.backup, "logmaster_backup", "backup.db.password"},
		} {
			variables, err := godotenv.Read(filepath.Join(directory, role.file))
			if err != nil {
				t.Fatal(err)
			}
			if variables["DB_NAME"] != database.name || variables["DB_USER"] != role.user {
				t.Fatalf("wrong database role in %s", role.file)
			}
			password := variables["DB_PASSWORD"]
			secret, err := os.ReadFile(filepath.Join(directory, role.secret))
			if err != nil || password != string(secret) {
				t.Fatalf("database credential does not match its PostgreSQL secret in %s", role.file)
			}
			if len(password) != 48 || passwords[password] {
				t.Fatalf("missing or shared database credential in %s", role.file)
			}
			passwords[password] = true
		}
	}
}
