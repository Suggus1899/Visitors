package security

import (
	"strings"
	"testing"
)

func TestPasswordPolicy(t *testing.T) {
	for _, password := range []string{"weak", "Withoutdigits!AAAA", "withoutupper!123", "WITHOUTLOWER!123", "WithoutSpecial123", strings.Repeat("Á", 36) + "a1!"} {
		if ValidatePassword(password) == nil {
			t.Fatalf("accepted weak/oversized/common password: %q", password)
		}
	}
	if e := ValidatePassword("Private!Safe12Á"); e != nil {
		t.Fatal(e)
	}
}
