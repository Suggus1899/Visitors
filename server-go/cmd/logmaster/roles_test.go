package main

import (
	"context"
	"strings"
	"testing"
)

func TestRoleProvisioningRejectsUnsafePasswordsBeforeDatabaseAccess(t *testing.T) {
	for _, password := range []string{"", "' DROP ROLE root; --", strings.Repeat("a", 47), strings.Repeat("G", 48)} {
		if err := provisionRoles(context.Background(), nil, "logmaster_pilot", password, strings.Repeat("b", 48)); err == nil {
			t.Fatalf("unsafe role password accepted: %q", password)
		}
	}
}
