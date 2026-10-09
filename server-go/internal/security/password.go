package security

import (
	"encoding/json"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/contracts"
	"strings"
	"unicode/utf8"
)

var commonPasswords = func() map[string]bool {
	b, e := contracts.Files.ReadFile("common-passwords.json")
	if e != nil {
		panic(e)
	}
	var list []string
	if e = json.Unmarshal(b, &list); e != nil {
		panic(e)
	}
	result := map[string]bool{}
	for _, s := range list {
		result[s] = true
	}
	return result
}()

func ValidatePassword(s string) error {
	lower, upper, digit, special := false, false, false, false
	for _, r := range s {
		lower = lower || (r >= 'a' && r <= 'z')
		upper = upper || (r >= 'A' && r <= 'Z')
		digit = digit || (r >= '0' && r <= '9')
		special = special || strings.ContainsRune("!@#$%^&*()_+-=[]{};':\"\\|,.<>/?", r)
	}
	if utf8.RuneCountInString(s) < 12 || len(s) > 72 || !lower || !upper || !digit || !special || commonPasswords[strings.ToLower(s)] {
		return errors.New("la contraseña requiere 12 caracteres, mayúscula, minúscula, número y símbolo; máximo 72 bytes UTF-8")
	}
	return nil
}
