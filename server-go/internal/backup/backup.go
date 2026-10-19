package backup

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/jackc/pgx/v5"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

var ErrPassword = errors.New("invalid restore password")
var ErrMetadata = errors.New("required backup metadata missing or invalid")
var ErrName = errors.New("invalid backup name")
var ErrTarget = errors.New("restore restricted to isolated logmaster_restore_test")

var namePattern = regexp.MustCompile(`^backup-[A-Za-z0-9_-]+\.dump(?:\.enc)?$`)

type Service struct{ Config config.Config }
type File struct {
	Name      string    `json:"name"`
	Date      time.Time `json:"date"`
	SizeBytes int64     `json:"sizeBytes"`
	Path      string    `json:"path"`
}
type Metadata struct {
	Version      int       `json:"version,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	PasswordHash string    `json:"passwordHash"`
	OriginalName string    `json:"originalName"`
	Engine       string    `json:"engine"`
	Digest       string    `json:"sha256,omitempty"`
}
type Result struct {
	FilePath        string `json:"filePath"`
	RestorePassword string `json:"restorePassword"`
}

func (s Service) root() (*os.Root, error) {
	if s.Config.BackupPath == "" {
		return nil, errors.New("BACKUP_PATH required")
	}
	if e := os.MkdirAll(s.Config.BackupPath, 0700); e != nil {
		return nil, e
	}
	return os.OpenRoot(s.Config.BackupPath)
}
func metaName(name string) string {
	return strings.TrimSuffix(strings.TrimSuffix(name, ".enc"), ".dump") + ".meta"
}
func (s Service) key() string {
	if s.Config.BackupPassword != "" {
		return s.Config.BackupPassword
	}
	return hex.EncodeToString(s.Config.EncryptionKey)
}
func command(ctx context.Context, c config.Config, tool string, args ...string) *exec.Cmd {
	binary := tool
	if directory := os.Getenv("PG_BIN_PATH"); directory != "" {
		binary = filepath.Join(directory, tool)
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+c.Password, "PGSSLMODE=disable")
	if c.DBSSL {
		cmd.Env = append(cmd.Env, "PGSSLMODE=verify-full")
	}
	return cmd
}

type cappedWriter struct {
	writer    io.Writer
	remaining int64
	err       error
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	if int64(len(p)) > w.remaining {
		w.err = errors.New("backup exceeds size limit")
		return 0, w.err
	}
	n, e := w.writer.Write(p)
	w.err = e
	w.remaining -= int64(n)
	return n, e
}
func (s Service) Create(ctx context.Context) (Result, error) {
	unlock, e := s.lock()
	if e != nil {
		return Result{}, e
	}
	defer unlock()
	return s.create(ctx)
}
func (s Service) create(ctx context.Context) (Result, error) {
	random, e := security.RandomToken()
	if e != nil {
		return Result{}, e
	}
	name := "backup-" + time.Now().UTC().Format("2006-01-02T15-04-05") + "-" + random[:12] + ".dump.enc"
	password, e := security.RandomToken()
	if e != nil {
		return Result{}, e
	}
	password = "trebol-" + password[:32]
	e = s.writeVersioned(name, password, func(output io.Writer) error {
		cmd := command(ctx, s.Config, "pg_dump", "-h", s.Config.Host, "-p", s.Config.Port, "-U", s.Config.User, "-d", s.Config.Database, "--format=custom", "--no-password")
		cmd.Stdout = output
		if err := cmd.Run(); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("pg_dump failed: %w", err)
		}
		return nil
	})
	if e != nil {
		return Result{}, e
	}
	return Result{FilePath: filepath.Join(s.Config.BackupPath, name), RestorePassword: password}, nil
}
func (s Service) List() ([]File, error) {
	root, e := s.root()
	if e != nil {
		return nil, e
	}
	defer root.Close()
	directory, e := root.Open(".")
	if e != nil {
		return nil, e
	}
	defer directory.Close()
	entries, e := directory.ReadDir(-1)
	if e != nil {
		return nil, e
	}
	files := []File{}
	for _, entry := range entries {
		if !entry.Type().IsRegular() || !namePattern.MatchString(entry.Name()) {
			continue
		}
		info, e := root.Stat(entry.Name())
		if e != nil {
			return nil, e
		}
		files = append(files, File{Name: entry.Name(), Date: info.ModTime(), SizeBytes: info.Size(), Path: filepath.Join(s.Config.BackupPath, entry.Name())})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Date.After(files[j].Date) })
	return files, nil
}
func (s Service) Remove(name string) error {
	unlock, e := s.lock()
	if e != nil {
		return e
	}
	defer unlock()
	return s.remove(name)
}
func (s Service) remove(name string) error {
	if !namePattern.MatchString(name) {
		return ErrName
	}
	root, e := s.root()
	if e != nil {
		return e
	}
	defer root.Close()
	if e = root.Remove(name); e != nil {
		return e
	}
	return root.Remove(metaName(name))
}
func (s Service) Prepare(name, password string) ([]byte, error) {
	prepared, err := s.PrepareFile(name, password)
	if err != nil {
		return nil, err
	}
	defer prepared.Close()
	data, err := io.ReadAll(io.LimitReader(prepared, maxLegacySize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxLegacySize {
		return nil, errors.New("in-memory preparation limit exceeded; use PrepareFile")
	}
	return data, nil
}
func Restore(ctx context.Context, target config.Config, data []byte) error {
	return RestoreAs(ctx, target, data, "", false)
}

// Operational callers must confirm the destination and stop the application before calling.
func RestoreAs(ctx context.Context, target config.Config, data []byte, root string, operational bool) error {
	return restoreReader(ctx, target, bytes.NewReader(data), int64(len(data)), root, operational)
}

func RestorePrepared(ctx context.Context, target config.Config, data io.ReadSeeker, root string, operational bool) error {
	size, err := data.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}
	return restoreReader(ctx, target, data, size, root, operational)
}

func (s Service) RestorePrepared(ctx context.Context, target config.Config, data io.ReadSeeker, root string, operational bool) error {
	unlock, err := s.lock()
	if err != nil {
		return err
	}
	defer unlock()
	return RestorePrepared(ctx, target, data, root, operational)
}

func restoreReader(ctx context.Context, target config.Config, data io.ReadSeeker, size int64, root string, operational bool) error {
	if !operational && (!target.LocalTest() || target.Database != "logmaster_restore_test") {
		return ErrTarget
	}
	if operational && root == "" && target.Database != "logmaster_restore_test" {
		return errors.New("root actor required")
	}
	connection, e := target.DBConfig()
	if e != nil {
		return e
	}
	database, e := pgx.ConnectConfig(ctx, connection)
	if e != nil {
		return e
	}
	defer database.Close(ctx)
	var exists bool
	if e = database.QueryRow(ctx, `SELECT to_regclass('public."Users"') IS NOT NULL`).Scan(&exists); e != nil {
		return e
	}
	var highest int64
	if exists {
		if e = database.QueryRow(ctx, `SELECT COALESCE(max("tokenVersion"),0) FROM "Users"`).Scan(&highest); e != nil {
			return e
		}
		if root != "" {
			var valid bool
			if e = database.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Users" WHERE username=$1 AND (role='root' OR ($2=false AND role='admin')))`, root, operational).Scan(&valid); e != nil || !valid {
				return errors.New("root actor absent before restore")
			}
		}
	} else if root != "" {
		return errors.New("root actor absent before restore")
	}
	if highest >= 2147483646 {
		return errors.New("session version exhausted")
	}
	if size < 5 || size > maxArchiveSize {
		return errors.New("invalid PostgreSQL archive")
	}
	if _, e = data.Seek(0, io.SeekStart); e != nil {
		return e
	}
	var header [5]byte
	if _, e = io.ReadFull(data, header[:]); e != nil || string(header[:]) != "PGDMP" {
		return errors.New("invalid PostgreSQL archive")
	}
	if _, e = data.Seek(0, io.SeekStart); e != nil {
		return e
	}
	var manifest bytes.Buffer
	list := command(ctx, target, "pg_restore", "--list")
	list.Stdin = data
	list.Stdout = &cappedWriter{writer: &manifest, remaining: 1024 * 1024}
	if e := list.Run(); e != nil {
		return errors.New("invalid PostgreSQL archive manifest")
	}
	selection, e := os.CreateTemp("", "logmaster-restore-*.list")
	if e != nil {
		return e
	}
	defer os.Remove(selection.Name())
	if _, e = selection.WriteString(restoreList(manifest.String())); e != nil {
		selection.Close()
		return e
	}
	if e = selection.Close(); e != nil {
		return e
	}
	file, e := os.CreateTemp("", "logmaster-restore-*.sql")
	if e != nil {
		return e
	}
	defer func() { file.Close(); os.Remove(file.Name()) }()
	if runtime.GOOS == "linux" {
		if e = os.Remove(file.Name()); e != nil {
			return e
		}
	}
	render := command(ctx, target, "pg_restore", "--no-owner", "--no-acl", "--use-list", selection.Name(), "--file=-")
	if _, e = data.Seek(0, io.SeekStart); e != nil {
		return e
	}
	render.Stdin = data
	// Compressed archives can expand substantially; fail before filling the temporary filesystem.
	output := &cappedWriter{writer: file, remaining: maxSQLSize}
	render.Stdout = output
	if e = render.Run(); e != nil {
		if output.err != nil {
			return fmt.Errorf("archive SQL preparation failed: %w", output.err)
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return errors.New("archive SQL preparation failed")
	}
	if e = os.Remove(selection.Name()); e != nil {
		return e
	}
	if _, e = file.Seek(0, io.SeekStart); e != nil {
		return e
	}
	// A clean schema also handles SERIAL/IDENTITY differences and removes stale objects.
	prefix := "DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n"
	cmd := command(ctx, target, "psql", "-X", "-h", target.Host, "-p", target.Port, "-U", target.User, "-d", target.Database, "--single-transaction", "--no-password", "--set=ON_ERROR_STOP=1")
	// Finalization belongs to the same transaction as the restored schema and data.
	allowedRole := "role='root'"
	if !operational {
		allowedRole = "role IN ('root','admin')"
	}
	finalize := fmt.Sprintf(`
SET LOCAL search_path=public,pg_catalog;
DO $restore_finalize$
DECLARE actor_id integer; actor_name text; actor_role text;
BEGIN
 SELECT id,username,role INTO actor_id,actor_name,actor_role FROM "Users" WHERE %s AND (%s='' OR username=%s) ORDER BY id LIMIT 1;
 IF actor_id IS NULL THEN RAISE EXCEPTION 'root actor absent after restore'; END IF;
 IF EXISTS(SELECT 1 FROM "Users" WHERE "tokenVersion">=2147483646) THEN RAISE EXCEPTION 'session version exhausted'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='logmaster_runtime') THEN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO logmaster_runtime';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO logmaster_runtime';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logmaster_runtime';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO logmaster_runtime';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='logmaster_backup') THEN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO logmaster_backup';
  EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO logmaster_backup';
  EXECUTE 'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_backup';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO logmaster_backup';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO logmaster_backup';
 END IF;
 UPDATE "Users" SET "tokenVersion"=GREATEST("tokenVersion",%d)+1,"updatedAt"=now();
 INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",role,status,"createdAt") VALUES(actor_id,actor_name,'BACKUP_RESTORE_COMPLETED','Backup','maintenance',actor_role,'success',now());
END; $restore_finalize$;
`, allowedRole, sqlLiteral(root), sqlLiteral(root), highest)
	cmd.Stdin = io.MultiReader(strings.NewReader(prefix), file, strings.NewReader(finalize))
	var diagnostics bytes.Buffer
	cmd.Args = append(cmd.Args, "--set=VERBOSITY=sqlstate")
	cmd.Stderr = &cappedWriter{writer: &diagnostics, remaining: 4096}
	if e = cmd.Run(); e != nil {
		code := regexp.MustCompile(`ERROR:\s+([A-Z0-9]{5})`).FindStringSubmatch(diagnostics.String())
		if len(code) == 2 {
			return fmt.Errorf("transactional restore failed (SQLSTATE %s)", code[1])
		}
		return errors.New("transactional restore failed")
	}
	return nil
}

func sqlLiteral(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }

// pg_restore can omit CREATE public even when its manifest contains a SCHEMA entry.
func restoreList(manifest string) string {
	lines := strings.Split(manifest, "\n")
	for i, line := range lines {
		if strings.Contains(line, " SCHEMA - public ") {
			lines[i] = ";" + line
		}
	}
	return strings.Join(lines, "\n")
}
