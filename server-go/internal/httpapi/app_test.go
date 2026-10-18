package httpapi

import (
	"encoding/json"
	"github.com/Suggus1899/Visitors/server-go/contracts"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
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

func TestRequestIDOnlyPropagatesSafeValues(t *testing.T) {
	for _, test := range []struct {
		input, expected string
	}{{strings.Repeat("a", 32), strings.Repeat("a", 32)}, {"spoofed\nrequest", ""}} {
		a := &App{}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Request-ID", test.input)
		a.headers(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).ServeHTTP(w, r)
		if actual := w.Header().Get("X-Request-ID"); actual != test.expected {
			t.Fatalf("request id %q propagated as %q", test.input, actual)
		}
	}
}

func TestSessionChecksDoNotConsumeCredentialRateLimit(t *testing.T) {
	a := &App{Config: config.Config{RateMaxRequests: 100, RateWindowMS: 60000}}
	h := a.limit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	for user := 0; user < 50; user++ {
		for check := 0; check < 2; check++ {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, "/api/v1/auth/session", nil)
			r.RemoteAddr = "127.0.0.1:41000"
			h.ServeHTTP(w, r)
			if w.Code != http.StatusNoContent {
				t.Fatalf("session check for user %d was rate limited: %d", user+1, w.Code)
			}
		}
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	r.RemoteAddr = "127.0.0.1:41000"
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("credential request was rate limited by session checks: %d", w.Code)
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
	if !actual["GET /api/v1/visits/calendar"] {
		t.Fatal("calendar route missing")
	}
	if len(actual) != len(routes)+1 {
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

func TestCheckInRequiresEachCompanionToHaveAnIndividualRegistration(t *testing.T) {
	for _, field := range []string{"companionName", "companionCedula"} {
		t.Run(field, func(t *testing.T) {
			body := `{"visitorCedula":"V-12345678","` + field + `":"Persona ficticia"}`
			w := httptest.NewRecorder()
			a := &App{}
			a.checkIn(w, httptest.NewRequest("POST", "/api/v1/visits/checkin", strings.NewReader(body)))

			var response struct {
				Success bool `json:"success"`
				Error   struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if w.Code != http.StatusBadRequest || response.Success || response.Error.Code != "INDIVIDUAL_REGISTRATION_REQUIRED" {
				t.Fatalf("unexpected response: %d %#v", w.Code, response)
			}
		})
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
