package config

import (
	"strings"
	"testing"
	"time"
)

func setup(t *testing.T) {
	t.Helper()
	for k, v := range map[string]string{"DB_HOST": "127.0.0.1", "DB_PORT": "55432", "DB_NAME": "logmaster_test", "DB_USER": "logmaster_test", "DB_PASSWORD": "fixture", "JWT_SECRET": strings.Repeat("s", 64), "JWT_REFRESH_SECRET": "", "ENCRYPTION_KEY": strings.Repeat("19", 32), "EDIT_PASSWORD": "fixture-edit-password", "JWT_ACCESS_EXPIRATION": "", "JWT_REFRESH_EXPIRATION": "", "PORT": "3000", "DB_SSL": "false"} {
		t.Setenv(k, v)
	}
}
func TestConfiguration(t *testing.T) {
	setup(t)
	c, e := FromEnvironment()
	if e != nil {
		t.Fatal(e)
	}
	if !c.LocalTest() || c.AccessTTL != 15*time.Minute || c.RefreshTTL != 7*24*time.Hour || c.RefreshSecret == c.JWTSecret {
		t.Fatal("incorrect defaults")
	}
	p, e := c.DBConfig()
	if e != nil || p.Host != "127.0.0.1" || p.Port != 55432 || p.TLSConfig != nil {
		t.Fatal("incorrect database target")
	}
	t.Setenv("DB_SSL", "true")
	c, e = FromEnvironment()
	if e != nil {
		t.Fatal(e)
	}
	p, e = c.DBConfig()
	if e != nil || p.TLSConfig == nil || p.TLSConfig.InsecureSkipVerify {
		t.Fatal("certificate verification disabled")
	}
}
func TestInvalidConfiguration(t *testing.T) {
	for _, tc := range []struct{ k, v string }{{"JWT_SECRET", "short"}, {"ENCRYPTION_KEY", "bad"}, {"EDIT_PASSWORD", ""}, {"DB_NAME", ""}, {"DB_PORT", "0"}, {"PORT", "-1"}, {"JWT_ACCESS_EXPIRATION", "0m"}, {"JWT_REFRESH_EXPIRATION", "999999999999d"}, {"DB_SSL", "tru"}, {"RETENTION_ENABLED", "yes"}} {
		t.Run(tc.k, func(t *testing.T) {
			setup(t)
			t.Setenv(tc.k, tc.v)
			if _, e := FromEnvironment(); e == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}
