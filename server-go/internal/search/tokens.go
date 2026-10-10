package search

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func Key(key []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte("logmaster/name-search/v1"))
	return h.Sum(nil)
}
func Fingerprint(key []byte) string {
	h := hmac.New(sha256.New, Key(key))
	h.Write([]byte("index-key-check"))
	return hex.EncodeToString(h.Sum(nil))
}
func Normalize(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
func Tokens(key []byte, value string) [][]byte {
	runes := []rune(Normalize(value))
	tokens := [][]byte{}
	seen := map[string]bool{}
	derived := Key(key)
	for i := 0; i+3 <= len(runes); i++ {
		h := hmac.New(sha256.New, derived)
		h.Write([]byte(string(runes[i : i+3])))
		token := h.Sum(nil)
		if !seen[string(token)] {
			seen[string(token)] = true
			tokens = append(tokens, token)
		}
	}
	return tokens
}
