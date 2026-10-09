package security

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"github.com/Suggus1899/Visitors/server-go/contracts"
	"github.com/golang-jwt/jwt/v5"
	"testing"
)

func TestNodeCompatibility(t *testing.T) {
	b, e := contracts.Files.ReadFile("crypto-node.json")
	if e != nil {
		t.Fatal(e)
	}
	var f map[string]json.RawMessage
	if e = json.Unmarshal(b, &f); e != nil {
		t.Fatal(e)
	}
	s := func(k string) string {
		var v string
		if e := json.Unmarshal(f[k], &v); e != nil {
			t.Fatal(e)
		}
		return v
	}
	key, _ := hex.DecodeString(s("key"))
	t.Run("current and legacy AES GCM", func(t *testing.T) {
		for _, k := range []string{"encrypted", "legacyEncrypted"} {
			actual, e := Decrypt(key, s(k))
			if e != nil || actual != s("plaintext") {
				t.Fatalf("%s: plaintext mismatch: %v", k, e)
			}
		}
	})
	t.Run("roundtrip and tamper rejection", func(t *testing.T) {
		v, e := Encrypt(key, s("plaintext"))
		if e != nil {
			t.Fatal(e)
		}
		plain, e := Decrypt(key, v)
		if e != nil || plain != s("plaintext") {
			t.Fatal("roundtrip")
		}
		v = v[:len(v)-2] + "00"
		if _, e = Decrypt(key, v); e == nil {
			t.Fatal("tampered tag accepted")
		}
		if _, e = Decrypt(key, "ENC:broken"); e == nil {
			t.Fatal("broken envelope accepted")
		}
	})
	t.Run("cedula hash", func(t *testing.T) {
		if Hash(s("cedula")) != s("cedulaHash") {
			t.Fatal("hash differs")
		}
	})
	t.Run("bcrypt Unicode and legacy long password", func(t *testing.T) {
		if !VerifyPassword(s("password"), s("passwordHash")) || !VerifyPassword(s("longPassword"), s("longPasswordHash")) {
			t.Fatal("Node hashes incompatible")
		}
		if VerifyPassword("wrong", s("passwordHash")) {
			t.Fatal("incorrect password accepted")
		}
		if _, e := PasswordHash(s("longPassword")); e == nil {
			t.Fatal("new long password silently truncated")
		}
	})
	t.Run("Node JWT HS256", func(t *testing.T) {
		token, e := jwt.Parse(s("jwt"), func(token *jwt.Token) (any, error) { return []byte(s("jwtSecret")), nil }, jwt.WithValidMethods([]string{"HS256"}))
		if e != nil || !token.Valid {
			t.Fatal(e)
		}
		c := token.Claims.(jwt.MapClaims)
		if c["tokenVersion"] != float64(7) || c["id"] != float64(123) {
			t.Fatal("session fields differ")
		}
	})
	t.Run("Node scrypt gzip backup", func(t *testing.T) {
		data, _ := base64.StdEncoding.DecodeString(s("backup"))
		plain, e := DecryptBackup(s("backupPassword"), data)
		if e != nil || string(plain) != s("backupPlaintext") {
			t.Fatal(e)
		}
		if _, e = DecryptBackup("wrong", data); e == nil {
			t.Fatal("incorrect backup key accepted")
		}
	})
}
