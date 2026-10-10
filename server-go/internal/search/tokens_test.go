package search

import (
	"bytes"
	"testing"
)

func TestProtectedUnicodeFragments(t *testing.T) {
	key := []byte("12345678901234567890123456789012")
	tokens := Tokens(key, "Áyala Gustavo")
	if len(tokens) != 11 {
		t.Fatal(len(tokens))
	}
	if !bytes.Equal(Tokens(key, "GUS")[0], Tokens(key, "gus")[0]) {
		t.Fatal("case mismatch")
	}
	if bytes.Equal(Tokens(key, "áya")[0], Tokens(key, "aya")[0]) {
		t.Fatal("accents discarded")
	}
	if len(Tokens(key, "aaaa")) != 1 || len(Tokens(key, "ab")) != 0 {
		t.Fatal("duplicate/short fragments")
	}
	if bytes.Equal(Tokens(key, "gus")[0], Tokens([]byte("other-key"), "gus")[0]) {
		t.Fatal("key separation failed")
	}
}
