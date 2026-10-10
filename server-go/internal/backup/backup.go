package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
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
	"sort"
	"strings"
	"time"
)

var ErrPassword = errors.New("invalid restore password")
var ErrMetadata = errors.New("required backup metadata missing or invalid")
var ErrName = errors.New("invalid backup name")
var ErrTarget = errors.New("restore restricted to isolated logmaster_restore_test")

const maxSize = 500 * 1024 * 1024

var namePattern = regexp.MustCompile(`^backup-[A-Za-z0-9_-]+\.dump(?:\.enc)?$`)

type Service struct{ Config config.Config }
type File struct {
	Name      string    `json:"name"`
	Date      time.Time `json:"date"`
	SizeBytes int64     `json:"sizeBytes"`
	Path      string    `json:"path"`
}
type Metadata struct {
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
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	if int64(len(p)) > w.remaining {
		return 0, errors.New("backup exceeds size limit")
	}
	n, e := w.writer.Write(p)
	w.remaining -= int64(n)
	return n, e
}
func (s Service) Create(ctx context.Context) (Result, error) {
	root, e := s.root()
	if e != nil {
		return Result{}, e
	}
	defer root.Close()
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
	temp, e := os.CreateTemp("", "logmaster-dump-*.dump")
	if e != nil {
		return Result{}, e
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	cmd := command(ctx, s.Config, "pg_dump", "-h", s.Config.Host, "-p", s.Config.Port, "-U", s.Config.User, "-d", s.Config.Database, "--format=custom", "--no-password")
	cmd.Stdout = &cappedWriter{writer: temp, remaining: maxSize}
	if e = cmd.Run(); e != nil {
		return Result{}, errors.New("pg_dump failed")
	}
	if _, e = temp.Seek(0, io.SeekStart); e != nil {
		return Result{}, e
	}
	plain, e := io.ReadAll(io.LimitReader(temp, maxSize+1))
	if e != nil {
		return Result{}, e
	}
	if len(plain) > maxSize || !strings.HasPrefix(string(plain[:min(5, len(plain))]), "PGDMP") {
		return Result{}, errors.New("invalid PostgreSQL archive")
	}
	encrypted, e := security.EncryptBackup(s.key(), plain)
	if e != nil {
		return Result{}, e
	}
	digest := sha256.Sum256(encrypted)
	metadata := Metadata{CreatedAt: time.Now().UTC(), PasswordHash: security.Hash(password), OriginalName: name, Engine: "postgresql", Digest: hex.EncodeToString(digest[:])}
	encoded, e := json.Marshal(metadata)
	if e != nil {
		return Result{}, e
	}
	file, e := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return Result{}, e
	}
	_, e = file.Write(encrypted)
	if e == nil {
		e = file.Sync()
	}
	closeError := file.Close()
	if e == nil {
		e = closeError
	}
	if e != nil {
		root.Remove(name)
		return Result{}, e
	}
	if e = root.WriteFile(metaName(name), encoded, 0600); e != nil {
		root.Remove(name)
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
	if !namePattern.MatchString(name) {
		return nil, ErrName
	}
	root, e := s.root()
	if e != nil {
		return nil, e
	}
	defer root.Close()
	file, e := root.Open(metaName(name))
	if e != nil {
		return nil, ErrMetadata
	}
	metadataBytes, e := io.ReadAll(io.LimitReader(file, 65537))
	file.Close()
	if e != nil || len(metadataBytes) > 65536 {
		return nil, ErrMetadata
	}
	var meta Metadata
	if json.Unmarshal(metadataBytes, &meta) != nil || meta.OriginalName != name || meta.Engine != "postgresql" || len(meta.PasswordHash) != 64 {
		return nil, ErrMetadata
	}
	actual := security.Hash(password)
	if subtle.ConstantTimeCompare([]byte(actual), []byte(meta.PasswordHash)) != 1 {
		return nil, ErrPassword
	}
	archive, e := root.Open(name)
	if e != nil {
		return nil, e
	}
	defer archive.Close()
	data, e := io.ReadAll(io.LimitReader(archive, maxSize+1))
	if e != nil {
		return nil, e
	}
	if len(data) > maxSize {
		return nil, errors.New("archive exceeds size limit")
	}
	if meta.Digest != "" {
		h := sha256.Sum256(data)
		if hex.EncodeToString(h[:]) != meta.Digest {
			return nil, errors.New("archive integrity check failed")
		}
	}
	if strings.HasSuffix(name, ".enc") {
		data, e = security.DecryptBackup(s.key(), data)
		if e != nil {
			return nil, e
		}
	}
	if len(data) < 5 || string(data[:5]) != "PGDMP" {
		return nil, errors.New("invalid PostgreSQL archive")
	}
	return data, nil
}
func Restore(ctx context.Context, target config.Config, data []byte) error {
	return RestoreAs(ctx, target, data, "", false)
}

// Operational callers must confirm the destination and stop the application before calling.
func RestoreAs(ctx context.Context, target config.Config, data []byte, root string, operational bool) error {
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
	if len(data) < 5 || len(data) > maxSize || string(data[:5]) != "PGDMP" {
		return errors.New("invalid PostgreSQL archive")
	}
	var manifest bytes.Buffer
	list := command(ctx, target, "pg_restore", "--list")
	list.Stdin = bytes.NewReader(data)
	list.Stdout = &cappedWriter{writer: &manifest, remaining: 1024 * 1024}
	if e := list.Run(); e != nil {
		return errors.New("invalid PostgreSQL archive manifest")
	}
	file, e := os.CreateTemp("", "logmaster-restore-*.sql")
	if e != nil {
		return e
	}
	defer func() { file.Close(); os.Remove(file.Name()) }()
	render := command(ctx, target, "pg_restore", "--no-owner", "--no-acl", "--file=-")
	render.Stdin = bytes.NewReader(data)
	render.Stdout = &cappedWriter{writer: file, remaining: maxSize}
	if e = render.Run(); e != nil {
		return errors.New("archive SQL preparation failed")
	}
	if _, e = file.Seek(0, io.SeekStart); e != nil {
		return e
	}
	// A clean schema also handles SERIAL/IDENTITY differences and removes stale objects.
	prefix := "DROP SCHEMA public CASCADE;\n"
	if !strings.Contains(manifest.String(), " SCHEMA - public ") {
		prefix += "CREATE SCHEMA public;\n"
	}
	cmd := command(ctx, target, "psql", "-X", "-h", target.Host, "-p", target.Port, "-U", target.User, "-d", target.Database, "--single-transaction", "--no-password", "--set=ON_ERROR_STOP=1")
	// Finalization belongs to the same transaction as the restored schema and data.
	allowedRole := "role='root'"
	if !operational {
		allowedRole = "role IN ('root','admin')"
	}
	finalize := fmt.Sprintf(`
DO $restore_finalize$
DECLARE actor_id integer; actor_name text; actor_role text;
BEGIN
 SELECT id,username,role INTO actor_id,actor_name,actor_role FROM "Users" WHERE %s AND (%s='' OR username=%s) ORDER BY id LIMIT 1;
 IF actor_id IS NULL THEN RAISE EXCEPTION 'root actor absent after restore'; END IF;
 IF EXISTS(SELECT 1 FROM "Users" WHERE "tokenVersion">=2147483646) THEN RAISE EXCEPTION 'session version exhausted'; END IF;
 UPDATE "Users" SET "tokenVersion"=GREATEST("tokenVersion",%d)+1,"updatedAt"=now();
 INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",role,status,"createdAt") VALUES(actor_id,actor_name,'BACKUP_RESTORE_COMPLETED','Backup','maintenance',actor_role,'success',now());
END $restore_finalize$;
`, allowedRole, sqlLiteral(root), sqlLiteral(root), highest)
	cmd.Stdin = io.MultiReader(strings.NewReader(prefix), file, strings.NewReader(finalize))
	if e = cmd.Run(); e != nil {
		return errors.New("transactional restore failed")
	}
	return nil
}

func sqlLiteral(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }
