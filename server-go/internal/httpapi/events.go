package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type visitEvent struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	VisitID   int32  `json:"visitId,omitempty"`
}

func (a *App) publish(kind string, id int32) {
	event := visitEvent{Type: kind, Timestamp: time.Now().UTC().Format(time.RFC3339Nano), VisitID: id}
	a.mu.Lock()
	defer a.mu.Unlock()
	for channel := range a.events {
		select {
		case channel <- event:
		default:
			close(channel)
			delete(a.events, channel)
		}
	}
}
func (a *App) StopEvents() { a.stopOnce.Do(func() { close(a.stopped) }) }
func (a *App) visitEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := w.(http.Flusher); !ok {
		failure(w, 500, "STREAM_UNAVAILABLE", "Eventos no disponibles")
		return
	}
	channel := make(chan visitEvent, 16)
	a.mu.Lock()
	if len(a.events) >= 256 {
		a.mu.Unlock()
		failure(w, 503, "STREAM_CAPACITY", "Capacidad de eventos alcanzada")
		return
	}
	a.events[channel] = struct{}{}
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.events, channel); a.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	controller := http.NewResponseController(w)
	send := func(event visitEvent) bool {
		if e := controller.SetWriteDeadline(time.Now().Add(5 * time.Second)); e != nil {
			return false
		}
		data, e := json.Marshal(event)
		if e != nil {
			return false
		}
		if _, e = w.Write(append(append([]byte("data: "), data...), []byte("\n\n")...)); e != nil {
			return false
		}
		return controller.Flush() == nil
	}
	if !send(visitEvent{Type: "system:connected", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}) {
		return
	}
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	expiry := time.NewTimer(time.Until(actor(r).ExpiresAt.Time))
	defer expiry.Stop()
	valid := func() bool {
		s, e := a.validateToken(r.Context(), strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), false)
		return e == nil && !s.MustChange
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-a.stopped:
			return
		case <-expiry.C:
			return
		case event, ok := <-channel:
			if !ok || !valid() || !send(event) {
				return
			}
		case <-ticker.C:
			if !valid() {
				return
			}
			if e := controller.SetWriteDeadline(time.Now().Add(5 * time.Second)); e != nil {
				return
			}
			if _, e := w.Write([]byte(":heartbeat\n\n")); e != nil {
				return
			}
			if controller.Flush() != nil {
				return
			}
		}
	}
}
