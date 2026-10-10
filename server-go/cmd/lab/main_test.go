package main

import (
	"net/http"
	"net/http/httptest"
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
