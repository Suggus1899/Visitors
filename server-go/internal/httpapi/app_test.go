package httpapi

import (
	"encoding/json"
	"github.com/Suggus1899/Visitors/server-go/contracts"
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"regexp"
	"strings"
	"testing"
)

func TestClientIP(t *testing.T) {
	request := httptest.NewRequest("GET", "/", nil)
	request.RemoteAddr = "127.0.0.1:4321"
	request.Header.Set("X-Forwarded-For", "203.0.113.88")
	a := &App{}
	if a.ClientIP(request) != "127.0.0.1" {
		t.Fatal("untrusted header accepted")
	}
	a.trusted = []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}
	if a.ClientIP(request) != "203.0.113.88" {
		t.Fatal("trusted proxy ignored")
	}
	request.Header.Set("X-Forwarded-For", "spoofed, 203.0.113.89")
	if a.ClientIP(request) != "203.0.113.89" {
		t.Fatal("wrong end of proxy chain trusted")
	}
}

func TestRoutesMatchBaseline(t *testing.T) {
	raw, err := contracts.Files.ReadFile("routes.json")
	if err != nil {
		t.Fatal(err)
	}
	var routes []struct {
		Method, Path string
		Protected    bool
	}
	if err = json.Unmarshal(raw, &routes); err != nil {
		t.Fatal(err)
	}
	a := &App{limits: map[string]window{}}
	h := a.Router()
	actual := map[string]bool{}
	parameters := regexp.MustCompile(`\{[^}]+\}`)
	if err = chi.Walk(h.(chi.Routes), func(method, path string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		actual[method+" "+parameters.ReplaceAllString(path, "{param}")] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if len(actual) != len(routes) {
		t.Fatalf("route count %d instead of %d", len(actual), len(routes))
	}
	for _, route := range routes {
		parts := strings.Split(route.Path, "/")
		for i, p := range parts {
			if strings.HasPrefix(p, ":") {
				parts[i] = "{" + p[1:] + "}"
			}
		}
		if !actual[route.Method+" "+parameters.ReplaceAllString(strings.Join(parts, "/"), "{param}")] {
			t.Error("missing route", route.Method, route.Path)
		}
		if route.Protected {
			for i, p := range parts {
				if strings.HasPrefix(p, "{") {
					parts[i] = "1"
				}
			}
			s, r := request(t, h, route.Method, strings.Join(parts, "/"), "", "")
			if s != 401 {
				t.Error("public protected route", route.Method, route.Path, s, r)
			}
		}
	}
}
func TestDecode(t *testing.T) {
	for _, body := range []string{`{"unexpected":1}`, `{"name":"x"} {}`, strings.Repeat("x", 5*1024*1024+1)} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		var target struct {
			Name string `json:"name"`
		}
		if decode(w, r, &target) {
			t.Fatal("invalid body accepted")
		}
		var envelope map[string]any
		if e := json.Unmarshal(w.Body.Bytes(), &envelope); e != nil || envelope["success"] != false {
			t.Fatal("invalid error contract")
		}
	}
}
func TestCORS(t *testing.T) {
	a := &App{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Origin", "https://untrusted.example")
	a.headers(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Fatal("untrusted origin passed") })).ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("untrusted origin accepted")
	}
}

func TestPanicAbortsResponse(t *testing.T) {
	defer func() {
		if recover() != http.ErrAbortHandler {
			t.Fatal("panic was not safely aborted")
		}
	}()
	recoverPanic(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("fixture private details")
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
}
