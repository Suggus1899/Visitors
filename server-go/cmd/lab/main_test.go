package main

import (
	"bytes"
	"image/png"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestLaboratoryClientRejectsFailedContracts(t *testing.T) {
	for _, value := range []struct {
		status int
		body   string
		ok     bool
	}{{200, `{"success":true,"data":{"id":4}}`, true}, {200, `{"success":false}`, false}, {403, `{"success":false}`, false}, {200, `invalid`, false}} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(value.status); w.Write([]byte(value.body)) }))
		var out struct{ ID int }
		e := call(server.Client(), "GET", server.URL, "", nil, &out)
		server.Close()
		if (e == nil) != value.ok {
			t.Fatal("failed contract miscounted", value.status, e)
		}
		if value.ok && out.ID != 4 {
			t.Fatal("response lost")
		}
	}
}

func TestFictitiousDatasetVolumeBoundaries(t *testing.T) {
	for _, volume := range [][3]int{{100, 1000, 75}, {100000, 1000000, 5000}, {100, 1000, 0}} {
		if err := validateFixtureVolume(volume[0], volume[1], volume[2]); err != nil {
			t.Fatalf("valid volume %v rejected: %v", volume, err)
		}
	}
	for _, volume := range [][3]int{{99, 1000, 75}, {100000, 1000001, 75}, {100, 1000, -1}, {100, 1000, 101}, {100000, 1000000, 5001}} {
		if err := validateFixtureVolume(volume[0], volume[1], volume[2]); err == nil {
			t.Fatalf("invalid volume %v accepted", volume)
		}
	}
}

func TestGeneratedPNGFixturesAreDeterministicValidAndSized(t *testing.T) {
	for _, size := range []int{128 << 10, 192 << 10, 256 << 10, 384 << 10, 512 << 10} {
		first, err := paddedPNG(42, size)
		if err != nil {
			t.Fatal(err)
		}
		second, err := paddedPNG(42, size)
		if err != nil || len(first) != size || !bytes.Equal(first, second) {
			t.Fatalf("fixture size %d: got=%d err=%v", size, len(first), err)
		}
		if _, err = png.Decode(bytes.NewReader(first)); err != nil {
			t.Fatalf("fixture size %d is not a valid PNG: %v", size, err)
		}
	}
}

func TestLoadTargetLimitsNetworkAndRequiresTLSForProxy(t *testing.T) {
	for _, base := range []string{"http://api:3000", "https://web:8443", "http://localhost:3000"} {
		if _, _, err := parseLoadTarget(base); err != nil {
			t.Fatalf("valid load target %q rejected: %v", base, err)
		}
	}
	for _, base := range []string{"https://example.com", "http://web:8443", "http://api.example.test", "https://user@web:8443"} {
		if _, _, err := parseLoadTarget(base); err == nil {
			t.Fatalf("unsafe load target %q accepted", base)
		}
	}
}

func TestBFFLoadRequiresBothSessionCookies(t *testing.T) {
	endpoint, _ := url.Parse("https://web:8443")
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	jar.SetCookies(endpoint, []*http.Cookie{{Name: "__Host-logmaster-access", Value: "access", Secure: true}, {Name: "__Host-logmaster-refresh", Value: "refresh", Secure: true}})
	if !hasSessionCookies(jar, endpoint) {
		t.Fatal("complete BFF cookie session not detected")
	}
	jar.SetCookies(endpoint, []*http.Cookie{{Name: "__Host-logmaster-refresh", Value: "", MaxAge: -1, Secure: true}})
	if hasSessionCookies(jar, endpoint) {
		t.Fatal("partial BFF cookie session accepted")
	}
}

func TestWriteRequestsUseConfiguredOrigin(t *testing.T) {
	origins := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origins <- r.Header.Get("Origin")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
	}))
	defer server.Close()
	t.Setenv("LAB_APP_ORIGIN", server.URL)
	if err := call(server.Client(), http.MethodPost, server.URL+"/api/v1/auth/login", "", map[string]string{"username": "fixture"}, nil); err != nil {
		t.Fatal(err)
	}
	if origin := <-origins; origin != server.URL {
		t.Fatalf("origin=%q want %q", origin, server.URL)
	}
}

func TestAPIOnlyRequestsOmitOriginWithoutOverride(t *testing.T) {
	t.Setenv("LAB_APP_ORIGIN", "")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "" {
			t.Errorf("unexpected origin=%q", r.Header.Get("Origin"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
	}))
	defer server.Close()
	if err := call(server.Client(), http.MethodPost, server.URL+"/api/v1/auth/login", "", map[string]string{"username": "fixture"}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestSummarizeCountsFailuresOnceAndUsesNearestRankP95(t *testing.T) {
	samples := make([]sample, 0, 140)
	for i := 1; i <= 100; i++ {
		samples = append(samples, sample{Kind: "query", Duration: float64(i) / 100, Failed: i == 1})
	}
	for i := 1; i <= 20; i++ {
		samples = append(samples, sample{Kind: "search", Duration: float64(i) / 10})
		samples = append(samples, sample{Kind: "operation", Duration: float64(i) / 20})
	}
	metrics, ratio, passed := summarize(samples, 0)
	if !passed || ratio != 1.0/140 {
		t.Fatalf("single failure should be counted once: ratio=%v passed=%v", ratio, passed)
	}
	query := metrics["query"].(map[string]any)
	if query["p95Seconds"] != float64(95)/100 {
		t.Fatalf("nearest-rank p95 = %v, want 0.95", query["p95Seconds"])
	}
	search := metrics["search"].(map[string]any)
	if search["p95Seconds"] != 1.9 {
		t.Fatalf("nearest-rank search p95 = %v, want 1.9", search["p95Seconds"])
	}

	samples = append(samples, sample{Kind: "operation", Duration: .1, Failed: true})
	_, ratio, passed = summarize(samples, 0)
	if passed || ratio != 2.0/141 {
		t.Fatalf("error threshold should fail at 2/141: ratio=%v passed=%v", ratio, passed)
	}
	_, _, passed = summarize(samples[:140], 1)
	if passed {
		t.Fatal("lost session must fail the load acceptance check")
	}
}
