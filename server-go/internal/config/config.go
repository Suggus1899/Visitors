package config

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Host, Port, Database, User, Password, Address, Environment                                             string
	JWTSecret, RefreshSecret, EditPassword, BackupPassword, BackupPath                                     string
	EncryptionKey                                                                                          []byte
	AccessTTL, RefreshTTL                                                                                  time.Duration
	DBSSL                                                                                                  bool
	RetentionEnabled                                                                                       bool
	DataRetentionDays, AuditRetentionDays, MaxLoginAttempts, LockoutMinutes, RateWindowMS, RateMaxRequests int
}

func Load() (Config, error) {
	file := os.Getenv("DOTENV_CONFIG_PATH")
	if file == "" {
		file = "../.env"
	}
	if err := godotenv.Load(file); err != nil {
		return Config{}, fmt.Errorf("load environment file: %w", err)
	}
	return FromEnvironment()
}

func FromEnvironment() (Config, error) {
	c := Config{Host: os.Getenv("DB_HOST"), Port: os.Getenv("DB_PORT"), Database: os.Getenv("DB_NAME"), User: os.Getenv("DB_USER"), Password: os.Getenv("DB_PASSWORD"), Environment: os.Getenv("NODE_ENV"), JWTSecret: os.Getenv("JWT_SECRET"), RefreshSecret: os.Getenv("JWT_REFRESH_SECRET"), EditPassword: os.Getenv("EDIT_PASSWORD"), BackupPassword: os.Getenv("BACKUP_PASSWORD"), BackupPath: os.Getenv("BACKUP_PATH"), DBSSL: os.Getenv("DB_SSL") == "true"}
	if c.Port == "" {
		c.Port = "5432"
	}
	p, e := strconv.Atoi(c.Port)
	if e != nil || p < 1 || p > 65535 {
		return c, errors.New("invalid DB_PORT")
	}
	if c.Environment == "" {
		c.Environment = "development"
	}
	host := os.Getenv("HTTP_HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	p, e = strconv.Atoi(port)
	if e != nil || p < 1 || p > 65535 {
		return c, errors.New("invalid PORT")
	}
	c.Address = net.JoinHostPort(host, port)
	if c.Host == "" || c.Database == "" || c.User == "" || c.Password == "" {
		return c, errors.New("explicit database configuration is required")
	}
	if len(c.JWTSecret) < 32 {
		return c, errors.New("JWT_SECRET must contain at least 32 bytes")
	}
	if c.RefreshSecret == "" {
		s := sha256.Sum256([]byte(c.JWTSecret + ":refresh"))
		c.RefreshSecret = hex.EncodeToString(s[:])
	}
	if len(c.RefreshSecret) < 32 || c.RefreshSecret == c.JWTSecret {
		return c, errors.New("JWT_REFRESH_SECRET must be independent and at least 32 bytes")
	}
	key := os.Getenv("ENCRYPTION_KEY")
	if key == "" {
		key = os.Getenv("PII_ENCRYPTION_KEY")
	}
	c.EncryptionKey, e = hex.DecodeString(key)
	if e != nil || len(c.EncryptionKey) != 32 {
		return c, errors.New("ENCRYPTION_KEY must be a 32-byte hexadecimal key")
	}
	if c.EditPassword == "" {
		return c, errors.New("EDIT_PASSWORD is required")
	}
	c.RetentionEnabled = os.Getenv("RETENTION_ENABLED") == "true"
	for _, key := range []string{"DB_SSL", "RETENTION_ENABLED"} {
		if raw := os.Getenv(key); raw != "" && raw != "true" && raw != "false" {
			return c, fmt.Errorf("invalid %s", key)
		}
	}
	for _, entry := range []struct {
		key      string
		fallback int
		target   *int
	}{{"DATA_RETENTION_DAYS", 60, &c.DataRetentionDays}, {"AUDIT_LOG_RETENTION_DAYS", 365, &c.AuditRetentionDays}, {"MAX_LOGIN_ATTEMPTS", 5, &c.MaxLoginAttempts}, {"LOCKOUT_DURATION_MINUTES", 15, &c.LockoutMinutes}, {"RATE_LIMIT_WINDOW_MS", 60000, &c.RateWindowMS}, {"RATE_LIMIT_MAX_REQUESTS", 100, &c.RateMaxRequests}} {
		value := entry.fallback
		if raw := os.Getenv(entry.key); raw != "" {
			value, e = strconv.Atoi(raw)
			if e != nil || value < 1 || value > 10000000 {
				return c, fmt.Errorf("invalid %s", entry.key)
			}
		}
		*entry.target = value
	}
	c.AccessTTL, e = duration(os.Getenv("JWT_ACCESS_EXPIRATION"), 15*time.Minute)
	if e != nil {
		return c, e
	}
	c.RefreshTTL, e = duration(os.Getenv("JWT_REFRESH_EXPIRATION"), 7*24*time.Hour)
	if e != nil {
		return c, e
	}
	return c, nil
}

func duration(s string, fallback time.Duration) (time.Duration, error) {
	if s == "" {
		return fallback, nil
	}
	if strings.HasSuffix(s, "d") {
		v, e := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if e != nil || v < 1 || v > 3650 {
			return 0, errors.New("invalid token duration")
		}
		return time.Duration(v) * 24 * time.Hour, nil
	}
	v, e := time.ParseDuration(s)
	if e != nil || v <= 0 {
		return 0, errors.New("invalid token duration")
	}
	return v, nil
}

func (c Config) DBConfig() (*pgx.ConnConfig, error) {
	p, e := pgx.ParseConfig("")
	if e != nil {
		return nil, e
	}
	port, _ := strconv.Atoi(c.Port)
	p.Host = c.Host
	p.Port = uint16(port)
	p.Database = c.Database
	p.User = c.User
	p.Password = c.Password
	p.ConnectTimeout = 5 * time.Second
	p.RuntimeParams = map[string]string{"timezone": "UTC", "statement_timeout": "30000", "idle_in_transaction_session_timeout": "30000"}
	p.Fallbacks = nil
	if c.DBSSL {
		p.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, ServerName: c.Host}
	} else {
		p.TLSConfig = nil
	}
	return p, nil
}

func (c Config) LocalTest() bool {
	return c.Host == "127.0.0.1" && c.Port == "55432" && (c.Database == "logmaster_test" || c.Database == "logmaster_restore_test" || c.Database == "logmaster_go_test")
}
func (c Config) LocalDevelopment() bool {
	return c.LocalTest() || c.Host == "127.0.0.1" && c.Port == "55432" && c.Database == "logmaster_go_dev"
}
