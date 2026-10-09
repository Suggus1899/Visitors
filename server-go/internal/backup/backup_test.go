package backup

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupMetadataAndNames(t *testing.T) {
	path := t.TempDir()
	service := Service{Config: config.Config{BackupPath: path, BackupPassword: "fake-backup-password"}}
	name := "backup-fixture.dump.enc"
	plain := []byte("PGDMP fictitious archive")
	encrypted, e := security.EncryptBackup(service.key(), plain)
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(filepath.Join(path, name), encrypted, 0600); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Prepare(name, "anything"); !errors.Is(e, ErrMetadata) {
		t.Fatal("missing metadata allowed", e)
	}
	for _, name := range []string{"../backup-fixture.dump.enc", "..\\backup-fixture.dump.enc", "C:\\backup-fixture.dump.enc", "file.dump.enc"} {
		if _, e = service.Prepare(name, "pw"); !errors.Is(e, ErrName) {
			t.Fatal("unsafe path accepted", name, e)
		}
	}
	metadata, _ := json.Marshal(Metadata{PasswordHash: security.Hash("correct"), OriginalName: name, Engine: "postgresql"})
	if e = os.WriteFile(filepath.Join(path, metaName(name)), metadata, 0600); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Prepare(name, "wrong"); !errors.Is(e, ErrPassword) {
		t.Fatal("wrong password accepted", e)
	}
	result, e := service.Prepare(name, "correct")
	if e != nil || string(result) != string(plain) {
		t.Fatal("legacy format failed", e)
	}
	encrypted[len(encrypted)-1] ^= 1
	if e = os.WriteFile(filepath.Join(path, name), encrypted, 0600); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Prepare(name, "correct"); e == nil {
		t.Fatal("tampering accepted")
	}
	if e = Restore(context.Background(), config.Config{Database: "visitors"}, plain); !errors.Is(e, ErrTarget) {
		t.Fatal("original database allowed", e)
	}
}
