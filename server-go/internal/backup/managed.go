package backup

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

type Status struct {
	At               time.Time `json:"at"`
	DurationSeconds  float64   `json:"durationSeconds"`
	Successful       bool      `json:"successful"`
	Archive          string    `json:"archive,omitempty"`
	SizeBytes        int64     `json:"sizeBytes,omitempty"`
	LastSuccessfulAt time.Time `json:"lastSuccessfulAt"`
}

// The shared volume serializes CLI and HTTP backups, including retention.
func (s Service) lock() (func(), error) {
	root, e := s.root()
	if e != nil {
		return nil, e
	}
	file, e := root.OpenFile(".backup.lock", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		root.Close()
		return nil, errors.New("backup already running; stale locks require a maintenance check")
	}
	file.Close()
	return func() { root.Remove(".backup.lock"); root.Close() }, nil
}

func privateRoot() (*os.Root, error) {
	path := os.Getenv("BACKUP_PASSWORD_PATH")
	if !filepath.IsAbs(path) {
		return nil, errors.New("absolute BACKUP_PASSWORD_PATH required")
	}
	if e := os.MkdirAll(path, 0700); e != nil {
		return nil, e
	}
	return os.OpenRoot(path)
}

func (s Service) Managed(ctx context.Context) (status Status, err error) {
	started := time.Now()
	status.At = started.UTC()
	private, e := privateRoot()
	if e != nil {
		return status, e
	}
	defer private.Close()
	if filepath.Clean(os.Getenv("BACKUP_PASSWORD_PATH")) == filepath.Clean(s.Config.BackupPath) {
		return status, errors.New("password storage must be separate from backups")
	}
	unlock, e := s.lock()
	if e != nil {
		return status, e
	}
	defer unlock()
	defer func() {
		status.DurationSeconds = time.Since(started).Seconds()
		status.Successful = err == nil
		if e := writeStatus(private, "backup-status.json", status); err == nil {
			err = e
		}
	}()
	result, e := s.create(ctx)
	if e != nil {
		return status, e
	}
	name := filepath.Base(result.FilePath)
	if _, e = s.Prepare(name, result.RestorePassword); e != nil {
		return status, e
	}
	encrypted, e := security.EncryptBackup(s.key(), []byte(result.RestorePassword))
	if e != nil {
		return status, e
	}
	if e = private.WriteFile(name+".password.enc", encrypted, 0600); e != nil {
		return status, e
	}
	status.Archive = name
	info, e := os.Stat(result.FilePath)
	if e != nil {
		return status, e
	}
	status.SizeBytes = info.Size()
	if e = s.prune(private, 30); e != nil {
		return status, e
	}
	return status, nil
}

func (s Service) SavedPassword(name string) (string, error) {
	if !namePattern.MatchString(name) {
		return "", ErrName
	}
	root, e := privateRoot()
	if e != nil {
		return "", e
	}
	defer root.Close()
	data, e := root.ReadFile(name + ".password.enc")
	if e != nil {
		return "", errors.New("private restore password unavailable")
	}
	plain, e := security.DecryptBackup(s.key(), data)
	if e != nil {
		return "", e
	}
	return string(plain), nil
}

func (s Service) prune(private *os.Root, keep int) error {
	files, e := s.List()
	if e != nil {
		return e
	}
	complete := []File{}
	for _, file := range files {
		// Retention owns only automated, verified pairs. Manual and incomplete copies are preserved.
		if _, e = private.Stat(file.Name + ".password.enc"); e != nil {
			continue
		}
		password, e := s.SavedPassword(file.Name)
		if e != nil {
			return e
		}
		if _, e = s.Prepare(file.Name, password); e != nil {
			return e
		}
		complete = append(complete, file)
	}
	for _, file := range complete[min(keep, len(complete)):] {
		if e = s.Remove(file.Name); e != nil {
			return e
		}
		if e = private.Remove(file.Name + ".password.enc"); e != nil {
			return e
		}
	}
	return nil
}

func writeStatus(root *os.Root, name string, status Status) error {
	if status.Successful {
		status.LastSuccessfulAt = status.At
	} else if previous, e := root.ReadFile(name); e == nil {
		var saved Status
		if e = json.Unmarshal(previous, &saved); e != nil {
			return e
		}
		status.LastSuccessfulAt = saved.LastSuccessfulAt
		if status.LastSuccessfulAt.IsZero() && saved.Successful {
			status.LastSuccessfulAt = saved.At
		}
	} else if !os.IsNotExist(e) {
		return e
	}
	data, e := json.Marshal(status)
	if e != nil {
		return e
	}
	if e = root.WriteFile(name+".tmp", data, 0600); e != nil {
		return e
	}
	return root.Rename(name+".tmp", name)
}

func RecordRehearsal(started time.Time, archive string, success bool) error {
	root, e := privateRoot()
	if e != nil {
		return e
	}
	defer root.Close()
	return writeStatus(root, "restore-status.json", Status{At: started.UTC(), DurationSeconds: time.Since(started).Seconds(), Successful: success, Archive: archive})
}

func ReadStatus() (map[string]Status, error) {
	root, e := privateRoot()
	if e != nil {
		return nil, e
	}
	defer root.Close()
	statuses := map[string]Status{}
	for _, name := range []string{"backup", "restore"} {
		raw, e := root.ReadFile(name + "-status.json")
		if os.IsNotExist(e) {
			continue
		}
		if e != nil {
			return nil, e
		}
		var status Status
		if e = json.Unmarshal(raw, &status); e != nil {
			return nil, e
		}
		statuses[name] = status
	}
	return statuses, nil
}
