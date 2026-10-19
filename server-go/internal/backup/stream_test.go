package backup

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

func TestVersionedArchiveRoundTripAndCorruption(t *testing.T) {
	service := Service{Config: config.Config{BackupPath: t.TempDir(), BackupPassword: "legacy-encryption-key"}}
	name := "backup-versioned-fixture.dump.enc"
	archive := append([]byte("PGDMP"), bytes.Repeat([]byte("fictional-data"), 2048)...)
	if err := service.writeVersioned(name, "random-restore-password", func(w io.Writer) error { _, err := io.Copy(w, bytes.NewReader(archive)); return err }); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.PrepareFile(name, "random-restore-password")
	if err != nil {
		t.Fatal(err)
	}
	plain, err := io.ReadAll(prepared)
	prepared.Close()
	if err != nil || !bytes.Equal(plain, archive) {
		t.Fatalf("versioned archive round trip: %v", err)
	}
	if _, err = service.PrepareFile(name, "wrong-password"); !errors.Is(err, ErrPassword) {
		t.Fatalf("wrong password: %v", err)
	}
	path := filepath.Join(service.Config.BackupPath, name)
	encrypted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name string
		data []byte
	}{
		{"tampered", append(append([]byte(nil), encrypted[:len(encrypted)-1]...), encrypted[len(encrypted)-1]^1)},
		{"truncated", encrypted[:len(encrypted)-1]},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := os.WriteFile(path, test.data, 0600); err != nil {
				t.Fatal(err)
			}
			metadataPath := filepath.Join(service.Config.BackupPath, metaName(name))
			metadataBytes, err := os.ReadFile(metadataPath)
			if err != nil {
				t.Fatal(err)
			}
			var metadata Metadata
			if err = json.Unmarshal(metadataBytes, &metadata); err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(test.data)
			metadata.Digest = hex.EncodeToString(digest[:])
			metadataBytes, err = json.Marshal(metadata)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(metadataPath, metadataBytes, 0600); err != nil {
				t.Fatal(err)
			}
			if prepared, err := service.PrepareFile(name, "random-restore-password"); err == nil {
				prepared.Close()
				t.Fatal("damaged archive was accepted")
			}
		})
	}
}

func TestVersionedArchiveStreamsWithoutMaterializingInput(t *testing.T) {
	service := Service{Config: config.Config{BackupPath: t.TempDir()}}
	name := "backup-stream-fixture.dump.enc"
	source := io.MultiReader(strings.NewReader("PGDMP"), io.LimitReader(zeroReader{}, 64<<20))
	if err := service.writeVersioned(name, "random-restore-password", func(w io.Writer) error { _, err := io.Copy(w, source); return err }); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.PrepareFile(name, "random-restore-password")
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	n, err := io.Copy(io.Discard, prepared)
	if err != nil || n != 64<<20+5 {
		t.Fatalf("streamed %d bytes: %v", n, err)
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func TestLegacyArchiveRemainsReadableAsFile(t *testing.T) {
	service := Service{Config: config.Config{BackupPath: t.TempDir(), BackupPassword: "old-key"}}
	name := "backup-legacy-fixture.dump.enc"
	plain := []byte("PGDMP old-format fixture")
	encrypted, err := security.EncryptBackup(service.key(), plain)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeLegacyFixture(name, "old-password", encrypted); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.PrepareFile(name, "old-password")
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	got, err := io.ReadAll(prepared)
	if err != nil || !bytes.Equal(got, plain) {
		t.Fatalf("legacy archive: %v", err)
	}
}

func TestVersionedPreparationReportsInsufficientSpace(t *testing.T) {
	service := Service{Config: config.Config{BackupPath: t.TempDir()}}
	name := "backup-disk-fixture.dump.enc"
	if err := service.writeVersioned(name, "random-restore-password", func(w io.Writer) error {
		_, err := io.WriteString(w, "PGDMP fixture")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	archive, err := os.Open(filepath.Join(service.Config.BackupPath, name))
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	if err = readVersioned(fullDisk{}, archive, "random-restore-password"); !errors.Is(err, syscall.ENOSPC) {
		t.Fatalf("disk-full error lost: %v", err)
	}
}

func TestMultiGiBArchiveStreaming(t *testing.T) {
	if os.Getenv("LOGMASTER_LARGE_BACKUP_TEST") != "true" {
		t.Skip("manual large-volume CI only")
	}
	service := Service{Config: config.Config{BackupPath: t.TempDir()}}
	name := "backup-large-fixture.dump.enc"
	size := int64(2) << 30
	if err := service.writeVersioned(name, "random-restore-password", func(w io.Writer) error {
		_, err := io.Copy(w, io.MultiReader(strings.NewReader("PGDMP"), io.LimitReader(zeroReader{}, size)))
		return err
	}); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.PrepareFile(name, "random-restore-password")
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	if got, err := io.Copy(io.Discard, prepared); err != nil || got != size+5 {
		t.Fatalf("large archive: %d bytes, %v", got, err)
	}
}

func (s Service) writeLegacyFixture(name, password string, data []byte) error {
	digest := sha256.Sum256(data)
	meta, err := json.Marshal(Metadata{PasswordHash: security.Hash(password), OriginalName: name, Engine: "postgresql", Digest: hex.EncodeToString(digest[:])})
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(s.Config.BackupPath, name), data, 0600); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.Config.BackupPath, metaName(name)), meta, 0600)
}
