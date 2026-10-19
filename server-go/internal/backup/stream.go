package backup

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"time"

	"filippo.io/age"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

const (
	maxLegacySize  int64 = 500 << 20
	maxArchiveSize int64 = 20 << 30
	maxSQLSize     int64 = 80 << 30
	backupVersion        = 2
)

type Prepared struct{ *os.File }

func (p *Prepared) Close() error {
	name := p.Name()
	err := p.File.Close()
	if removeErr := os.Remove(name); err == nil && !os.IsNotExist(removeErr) {
		err = removeErr
	}
	return err
}

func (s Service) writeVersioned(name, password string, produce func(io.Writer) error) error {
	root, err := s.root()
	if err != nil {
		return err
	}
	defer root.Close()
	partial := name + ".partial"
	file, err := root.OpenFile(partial, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer root.Remove(partial)
	recipient, err := age.NewScryptRecipient(password)
	if err != nil {
		file.Close()
		return err
	}
	// The generated passphrase is random; the smaller work factor keeps unattended verification bounded.
	recipient.SetWorkFactor(15)
	hash := sha256.New()
	encryptedOutput := &cappedWriter{writer: io.MultiWriter(file, hash), remaining: maxArchiveSize}
	encrypted, err := age.Encrypt(encryptedOutput, recipient)
	if err == nil {
		plainOutput := &cappedWriter{writer: encrypted, remaining: maxArchiveSize}
		err = produce(plainOutput)
		if plainOutput.err != nil {
			err = plainOutput.err
		}
		if closeErr := encrypted.Close(); err == nil {
			err = closeErr
		}
	}
	if encryptedOutput.err != nil {
		err = encryptedOutput.err
	}
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	archive, err := root.Open(partial)
	if err != nil {
		return err
	}
	err = readVersioned(io.Discard, archive, password)
	archive.Close()
	if err != nil {
		return err
	}
	meta := Metadata{Version: backupVersion, CreatedAt: time.Now().UTC(), PasswordHash: security.Hash(password), OriginalName: name, Engine: "postgresql", Digest: hex.EncodeToString(hash.Sum(nil))}
	encoded, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	metaFile := metaName(name)
	if err = root.WriteFile(metaFile+".partial", encoded, 0600); err != nil {
		return err
	}
	defer root.Remove(metaFile + ".partial")
	if err = root.Rename(metaFile+".partial", metaFile); err != nil {
		return err
	}
	if err = root.Rename(partial, name); err != nil {
		root.Remove(metaFile)
		return err
	}
	return nil
}

func readVersioned(dst io.Writer, source io.Reader, password string) error {
	identity, err := age.NewScryptIdentity(password)
	if err != nil {
		return err
	}
	reader, err := age.Decrypt(source, identity)
	if err != nil {
		return fmt.Errorf("archive authentication failed: %w", err)
	}
	var header [5]byte
	if _, err = io.ReadFull(reader, header[:]); err != nil {
		return fmt.Errorf("invalid PostgreSQL archive: %w", err)
	}
	if string(header[:]) != "PGDMP" {
		return errors.New("invalid PostgreSQL archive")
	}
	limited := &cappedWriter{writer: dst, remaining: maxArchiveSize}
	if _, err = limited.Write(header[:]); err != nil {
		return err
	}
	if _, err = io.Copy(limited, reader); err != nil {
		return err
	}
	return limited.err
}

// PrepareFile verifies the complete encrypted archive before exposing a private temporary file.
func (s Service) PrepareFile(name, password string) (*Prepared, error) {
	unlock, err := s.lock()
	if err != nil {
		return nil, err
	}
	defer unlock()
	return s.prepareFile(name, password)
}

func (s Service) prepareFile(name, password string) (*Prepared, error) {
	if !namePattern.MatchString(name) {
		return nil, ErrName
	}
	root, err := s.root()
	if err != nil {
		return nil, err
	}
	defer root.Close()
	metaFile, err := root.Open(metaName(name))
	if err != nil {
		return nil, ErrMetadata
	}
	metadataBytes, err := io.ReadAll(io.LimitReader(metaFile, 65537))
	metaFile.Close()
	if err != nil || len(metadataBytes) > 65536 {
		return nil, ErrMetadata
	}
	var meta Metadata
	if json.Unmarshal(metadataBytes, &meta) != nil || meta.OriginalName != name || meta.Engine != "postgresql" || len(meta.PasswordHash) != 64 || meta.Version != 0 && meta.Version != backupVersion || meta.Version == backupVersion && meta.Digest == "" {
		return nil, ErrMetadata
	}
	if subtle.ConstantTimeCompare([]byte(security.Hash(password)), []byte(meta.PasswordHash)) != 1 {
		return nil, ErrPassword
	}
	archive, err := root.Open(name)
	if err != nil {
		return nil, err
	}
	defer archive.Close()
	info, err := archive.Stat()
	if err != nil {
		return nil, err
	}
	limit := maxLegacySize
	if meta.Version == backupVersion {
		limit = maxArchiveSize
	}
	if info.Size() > limit {
		return nil, errors.New("archive exceeds size limit")
	}
	if meta.Digest != "" {
		hash := sha256.New()
		if _, err = io.Copy(hash, archive); err != nil {
			return nil, err
		}
		if subtle.ConstantTimeCompare([]byte(hex.EncodeToString(hash.Sum(nil))), []byte(meta.Digest)) != 1 {
			return nil, errors.New("archive integrity check failed")
		}
		if _, err = archive.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
	}
	prepared, err := os.CreateTemp("", "logmaster-prepared-*.dump")
	if err != nil {
		return nil, err
	}
	cleanup := func() { prepared.Close(); os.Remove(prepared.Name()) }
	if runtime.GOOS == "linux" {
		if err = os.Remove(prepared.Name()); err != nil {
			cleanup()
			return nil, err
		}
	}
	if meta.Version == backupVersion {
		err = readVersioned(prepared, archive, password)
	} else {
		var data []byte
		data, err = io.ReadAll(io.LimitReader(archive, maxLegacySize+1))
		if err == nil && int64(len(data)) > maxLegacySize {
			err = errors.New("archive exceeds size limit")
		}
		if err == nil && strings.HasSuffix(name, ".enc") {
			data, err = security.DecryptBackup(s.key(), data)
		}
		if err == nil && (len(data) < 5 || string(data[:5]) != "PGDMP") {
			err = errors.New("invalid PostgreSQL archive")
		}
		if err == nil {
			_, err = prepared.Write(data)
		}
	}
	if err == nil {
		_, err = prepared.Seek(0, io.SeekStart)
	}
	if err != nil {
		cleanup()
		return nil, err
	}
	return &Prepared{prepared}, nil
}
