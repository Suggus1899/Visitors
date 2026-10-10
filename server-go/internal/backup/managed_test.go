package backup

import (
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"os"
	"testing"
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
