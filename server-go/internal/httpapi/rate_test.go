package httpapi

import (
	"fmt"
	"testing"
	"time"
)

func TestSharedIPAccountLimits(t *testing.T) {
	a := &App{}
	now := time.Now()
	for i := 0; i < 50; i++ {
		if !a.allowRequest(fmt.Sprintf("account:127.0.0.1:user%d", i), 20, 15*time.Minute, now) {
			t.Fatal("independent account denied")
		}
	}
	for i := 1; i < 20; i++ {
		if !a.allowRequest("account:127.0.0.1:user0", 20, 15*time.Minute, now) {
			t.Fatal("account denied early")
		}
	}
	if a.allowRequest("account:127.0.0.1:user0", 20, 15*time.Minute, now) {
		t.Fatal("account rate limit absent")
	}
	if !a.allowRequest("account:127.0.0.1:user0", 20, 15*time.Minute, now.Add(16*time.Minute)) {
		t.Fatal("expired limit retained")
	}
}
