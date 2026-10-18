package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/golang-jwt/jwt/v5"
)

func TestSessionTokensCarryAnAbsoluteExpiry(t *testing.T) {
	a := &App{Config: config.Config{
		AccessTTL: 15 * time.Minute, RefreshTTL: 7 * 24 * time.Hour,
		JWTSecret: strings.Repeat("a", 64), RefreshSecret: strings.Repeat("b", 64),
	}}
	data, err := a.tokens(&Session{ID: 1, Username: "fixture", Role: "operador"})
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"token", "refreshToken"} {
		token, ok := data[field].(string)
		if !ok {
			t.Fatalf("missing token %s", field)
		}
		parts := strings.Split(token, ".")
		payload, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			t.Fatal(err)
		}
		var claims map[string]any
		if err = json.Unmarshal(payload, &claims); err != nil {
			t.Fatal(err)
		}
		for _, claim := range []string{"sessionStartedAt", "absoluteExpiresAt"} {
			if _, exists := claims[claim]; !exists {
				t.Errorf("%s token is missing %s", field, claim)
			}
		}
	}
}

func TestRefreshTokenExpiresAtAbsoluteSessionDeadline(t *testing.T) {
	now := time.Now()
	started := now.Add(-absoluteSessionTTL + time.Hour)
	absolute := now.Add(time.Hour)
	a := &App{Config: config.Config{
		AccessTTL: 15 * time.Minute, RefreshTTL: 7 * 24 * time.Hour,
		JWTSecret: strings.Repeat("a", 64), RefreshSecret: strings.Repeat("b", 64),
	}}
	data, err := a.tokens(&Session{ID: 1, Username: "fixture", Role: "operador", SessionStartedAt: started, AbsoluteExpiresAt: absolute})
	if err != nil {
		t.Fatal(err)
	}
	claims := &Session{}
	parsed, err := jwt.ParseWithClaims(data["refreshToken"].(string), claims, func(_ *jwt.Token) (any, error) { return []byte(a.Config.RefreshSecret), nil })
	if err != nil || !parsed.Valid {
		t.Fatalf("refresh token did not parse: %v", err)
	}
	if claims.ExpiresAt.Time.After(absolute) || claims.AbsoluteExpiresAt.After(absolute) || !claims.SessionStartedAt.Equal(started) {
		t.Fatalf("refresh extended the absolute session deadline: %#v", claims)
	}
}

func TestLegacyRefreshTokenRequiresFreshLogin(t *testing.T) {
	secret := strings.Repeat("b", 64)
	legacy, err := jwt.NewWithClaims(jwt.SigningMethodHS256, &Session{ID: 1, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	a := &App{Config: config.Config{RefreshSecret: secret}}
	if _, err = a.validateToken(context.Background(), legacy, true); err == nil {
		t.Fatal("legacy refresh token without an absolute expiry was accepted")
	}
}
