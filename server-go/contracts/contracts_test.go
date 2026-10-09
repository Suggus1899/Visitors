package contracts

import (
	"encoding/json"
	"testing"
)

func TestRouteInventory(t *testing.T) {
	raw, e := Files.ReadFile("routes.json")
	if e != nil {
		t.Fatal(e)
	}
	var routes []struct {
		Method, Path   string
		Protected      bool
		Binary, Stream bool
	}
	if e = json.Unmarshal(raw, &routes); e != nil {
		t.Fatal(e)
	}
	if len(routes) != 53 {
		t.Fatalf("unexpected route inventory: %d", len(routes))
	}
	seen := map[string]bool{}
	public := map[string]bool{"/api/v1/auth/login": true, "/api/v1/auth/forgot-password": true, "/api/v1/auth/reset-password": true, "/api/v1/auth/refresh": true, "/api/v1/health": true}
	for _, route := range routes {
		key := route.Method + " " + route.Path
		if seen[key] {
			t.Fatal("duplicate route", key)
		}
		seen[key] = true
		if !route.Protected && !public[route.Path] {
			t.Fatal("unexpected public route", key)
		}
		if (route.Binary || route.Stream) && !route.Protected {
			t.Fatal("sensitive route is public", key)
		}
	}
}
