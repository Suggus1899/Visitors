package backup

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"os"
	"testing"
	"time"
)

func TestSharedBackupLock(t *testing.T) {
	service := Service{Config: config.Config{BackupPath: t.TempDir()}}
	unlock, e := service.lock()
	if e != nil {
		t.Fatal(e)
	}
	if _, e = service.lock(); e == nil {
		t.Fatal("concurrent backup admitted")
	}
	unlock()
	again, e := service.lock()
	if e != nil {
		t.Fatal(e)
	}
	again()
}

func TestRetentionKeepsThirtyCompletePairsAndStopsOnDamage(t *testing.T) {
	t.Setenv("BACKUP_PASSWORD_PATH", t.TempDir())
	service := Service{Config: config.Config{BackupPath: t.TempDir(), BackupPassword: "fixture-private-key"}}
	root, e := service.root()
	if e != nil {
		t.Fatal(e)
	}
	defer root.Close()
	private, e := privateRoot()
	if e != nil {
		t.Fatal(e)
	}
	defer private.Close()
	archive, e := security.EncryptBackup(service.key(), []byte("PGDMP fixture"))
	if e != nil {
		t.Fatal(e)
	}
	password, e := security.EncryptBackup(service.key(), []byte("fixture-password"))
	if e != nil {
		t.Fatal(e)
	}
	digest := sha256.Sum256(archive)
	for i := 0; i < 32; i++ {
		name := fmt.Sprintf("backup-fixture-%02d.dump.enc", i)
		metadata, e := json.Marshal(Metadata{OriginalName: name, Engine: "postgresql", PasswordHash: security.Hash("fixture-password"), Digest: hex.EncodeToString(digest[:])})
		if e != nil {
			t.Fatal(e)
		}
		if e = root.WriteFile(name, archive, 0600); e != nil {
			t.Fatal(e)
		}
		if e = root.WriteFile(metaName(name), metadata, 0600); e != nil {
			t.Fatal(e)
		}
		if e = private.WriteFile(name+".password.enc", password, 0600); e != nil {
			t.Fatal(e)
		}
	}
	if e = service.prune(private, 30); e != nil {
		t.Fatal(e)
	}
	files, e := service.List()
	if e != nil || len(files) != 30 {
		t.Fatal(len(files), e)
	}
	if e = root.WriteFile(files[0].Name, []byte("damaged"), 0600); e != nil {
		t.Fatal(e)
	}
	if e = service.prune(private, 1); e == nil {
		t.Fatal("damaged backup allowed pruning")
	}
	files, e = service.List()
	if e != nil || len(files) != 30 {
		t.Fatal("pruning lost copies after validation failure", e)
	}
}
func TestPrivatePasswordAndStatus(t *testing.T) {
	t.Setenv("BACKUP_PASSWORD_PATH", t.TempDir())
	root, e := privateRoot()
	if e != nil {
		t.Fatal(e)
	}
	defer root.Close()
	if e = writeStatus(root, "backup-status.json", Status{Successful: true}); e != nil {
		t.Fatal(e)
	}
	statuses, e := ReadStatus()
	if e != nil || !statuses["backup"].Successful {
		t.Fatal(statuses, e)
	}
	if _, e = os.Stat(os.Getenv("BACKUP_PASSWORD_PATH") + "/backup-status.json.tmp"); !os.IsNotExist(e) {
		t.Fatal("temporary status left behind")
	}
	if _, e = (Service{}).SavedPassword("../outside"); e != ErrName {
		t.Fatal(e)
	}
}

func TestFailedAttemptPreservesLastSuccessfulDate(t *testing.T) {
	t.Setenv("BACKUP_PASSWORD_PATH", t.TempDir())
	root, e := privateRoot()
	if e != nil {
		t.Fatal(e)
	}
	defer root.Close()
	verified := time.Date(2026, 10, 10, 5, 0, 0, 0, time.UTC)
	for _, name := range []string{"backup", "restore"} {
		if e = writeStatus(root, name+"-status.json", Status{At: verified, Successful: true}); e != nil {
			t.Fatal(e)
		}
		if e = writeStatus(root, name+"-status.json", Status{At: verified.Add(time.Hour)}); e != nil {
			t.Fatal(e)
		}
	}
	statuses, e := ReadStatus()
	if e != nil {
		t.Fatal(e)
	}
	for _, status := range statuses {
		if status.Successful || !status.LastSuccessfulAt.Equal(verified) {
			t.Fatal(status)
		}
	}
}
