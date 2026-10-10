package httpapi

import (
	"context"
	"strings"
	"testing"
)

func TestLocalSMTPGuard(t *testing.T) {
	for _, host := range []string{"mailpit", "127.0.0.1"} {
		t.Setenv("SMTP_HOST", host)
		t.Setenv("SMTP_PORT", "1025")
		t.Setenv("SMTP_TLS_MODE", "local")
		t.Setenv("NODE_ENV", "production")
		if e := sendResetEmail(context.Background(), "test@example.test", "fixture"); e == nil || !strings.Contains(e.Error(), "restricted") {
			t.Fatal(e)
		}
	}
	t.Setenv("NODE_ENV", "development")
	t.Setenv("SMTP_HOST", "smtp.example.test")
	if e := sendResetEmail(context.Background(), "test@example.test", "fixture"); e == nil || !strings.Contains(e.Error(), "restricted") {
		t.Fatal(e)
	}
	t.Setenv("SMTP_TLS_MODE", "invalid")
	if e := sendResetEmail(context.Background(), "test@example.test", "fixture"); e == nil || !strings.Contains(e.Error(), "invalid") {
		t.Fatal(e)
	}
}
