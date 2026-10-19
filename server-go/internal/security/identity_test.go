package security

import "testing"

func TestIdentityHashIsKeyedAndSeparateFromTokenHashing(t *testing.T) {
	key := []byte("fictional-encryption-key-material")
	cedula := "V-12345678"
	got := IdentityHash(key, cedula)
	if got != IdentityHash(key, cedula) || got == Hash(cedula) {
		t.Fatal("identity HMAC is not deterministic and domain separated")
	}
	if got == IdentityHash([]byte("different-key"), cedula) {
		t.Fatal("identity HMAC did not change with its key")
	}
	if IdentityFingerprint(key) == IdentityFingerprint([]byte("different-key")) {
		t.Fatal("identity fingerprint did not change with its key")
	}
	if IdentityFingerprint(key) == Hash(string(key)) {
		t.Fatal("identity fingerprint reused the unkeyed token hash")
	}
}

func TestNormalizeIdentityMatchesVisitorLookupNormalization(t *testing.T) {
	for input, expected := range map[string]string{"v12345678": "V-12345678", " V-12345678 ": "V-12345678", "e-12345678": "E-12345678"} {
		if actual := NormalizeIdentity(input); actual != expected {
			t.Fatalf("NormalizeIdentity(%q) = %q, want %q", input, actual, expected)
		}
	}
}
