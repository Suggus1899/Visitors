package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"sync"
	"time"
)

type App struct {
	Config   config.Config
	Pool     *pgxpool.Pool
	Queries  *store.Queries
	mu       sync.Mutex
	limits   map[string]window
	trusted  []netip.Prefix
	events   map[chan visitEvent]struct{}
	stopped  chan struct{}
	stopOnce sync.Once
}
type window struct {
	count int
	until time.Time
}
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func success(w http.ResponseWriter, data any) {
	successStatus(w, 200, data)
}
func successStatus(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"success": true, "data": data})
}
func failure(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"success": false, "error": apiError{Code: code, Message: message}})
}
func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(target); e != nil {
		var size *http.MaxBytesError
		if errors.As(e, &size) {
			failure(w, 413, "PAYLOAD_TOO_LARGE", "La solicitud supera 5 MB")
		} else {
			failure(w, 400, "VALIDATION_ERROR", "Datos de solicitud inválidos")
		}
		return false
	}
	if d.Decode(&struct{}{}) != io.EOF {
		failure(w, 400, "VALIDATION_ERROR", "JSON inválido")
		return false
	}
	return true
}
func (a *App) serverError(w http.ResponseWriter, e error) {
	slog.Error("operation failed", "error_type", fmt.Sprintf("%T", e))
	failure(w, 500, "SERVER_ERROR", "No se pudo completar la operación")
}

func New(ctx context.Context, c config.Config) (*App, error) {
	p, e := pgxpool.ParseConfig("")
	if e != nil {
		return nil, e
	}
	connection, e := c.DBConfig()
	if e != nil {
		return nil, e
	}
	p.ConnConfig = connection
	p.MaxConns = 10
	p.MinConns = 1
	pool, e := pgxpool.NewWithConfig(ctx, p)
	if e != nil {
		return nil, e
	}
	if e = pool.Ping(ctx); e != nil {
		pool.Close()
		return nil, errors.New("database connection failed")
	}
	a := &App{Config: c, Pool: pool, Queries: store.New(pool), limits: map[string]window{}, events: map[chan visitEvent]struct{}{}, stopped: make(chan struct{})}
	for _, entry := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if strings.TrimSpace(entry) == "" {
			continue
		}
		prefix, e := netip.ParsePrefix(strings.TrimSpace(entry))
		if e != nil {
			pool.Close()
			return nil, errors.New("invalid trusted proxy CIDR")
		}
		a.trusted = append(a.trusted, prefix)
	}
	return a, nil
}

func (a *App) ClientIP(r *http.Request) string {
	host, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		host = r.RemoteAddr
	}
	ip, e := netip.ParseAddr(host)
	if e != nil {
		return "unknown"
	}
	trusted := false
	for _, prefix := range a.trusted {
		if prefix.Contains(ip) {
			trusted = true
			break
		}
	}
	if trusted {
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for i := len(parts) - 1; i >= 0; i-- {
			candidate, e := netip.ParseAddr(strings.TrimSpace(parts[i]))
			if e != nil {
				return ip.String()
			}
			ip = candidate
			trusted = false
			for _, prefix := range a.trusted {
				if prefix.Contains(ip) {
					trusted = true
					break
				}
			}
			if !trusted {
				break
			}
		}
	}
	return ip.String()
}

func (a *App) limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/health" {
			next.ServeHTTP(w, r)
			return
		}
		max := a.Config.RateMaxRequests
		ttl := time.Duration(a.Config.RateWindowMS) * time.Millisecond
		if max == 0 {
			max = 100
		}
		if ttl == 0 {
			ttl = time.Minute
		}
		bucket := "api"
		if strings.HasPrefix(r.URL.Path, "/api/v1/auth/") && r.URL.Path != "/api/v1/auth/refresh" {
			max = 20
			ttl = 15 * time.Minute
			bucket = "auth"
		}
		key := bucket + ":" + a.ClientIP(r)
		now := time.Now()
		a.mu.Lock()
		for k, v := range a.limits {
			if now.After(v.until) {
				delete(a.limits, k)
			}
		}
		state := a.limits[key]
		if state.until.IsZero() {
			state.until = now.Add(ttl)
		}
		allowed := state.count < max
		if len(a.limits) >= 10000 && state.count == 0 {
			allowed = false
		}
		state.count++
		if allowed {
			a.limits[key] = state
		}
		a.mu.Unlock()
		if !allowed {
			w.Header().Set("Retry-After", "60")
			failure(w, 429, "RATE_LIMITED", "Demasiadas solicitudes")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		if origin != "" {
			allowed := false
			origins := os.Getenv("CORS_ORIGINS")
			if origins == "" && a.Config.Environment != "production" {
				origins = "http://localhost:5173,http://127.0.0.1:5173"
			}
			for _, candidate := range strings.Split(origins, ",") {
				if strings.TrimSpace(candidate) == origin {
					allowed = true
				}
			}
			if !allowed {
				failure(w, 403, "FORBIDDEN", "Origen no autorizado")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) Router() http.Handler {
	router := chi.NewRouter()
	router.Use(recoverPanic, a.headers, a.limit)
	a.mountAuth(router)
	a.mountUsers(router)
	a.mountVisitors(router)
	a.mountVisits(router)
	a.mountPrivacy(router)
	a.mountAudit(router)
	a.mountReports(router)
	a.mountBackups(router)
	router.With(a.authenticate).Get("/api/v1/events/visits", a.visitEvents)
	router.NotFound(func(w http.ResponseWriter, r *http.Request) { failure(w, 404, "NOT_FOUND", "Ruta no encontrada") })
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		failure(w, 405, "METHOD_NOT_ALLOWED", "Método no permitido")
	})
	router.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if e := a.Pool.Ping(ctx); e != nil {
			failure(w, 503, "UNAVAILABLE", "Base de datos no disponible")
			return
		}
		success(w, map[string]any{"status": "ok", "backend": "go"})
	})
	return router
}

func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				if value == http.ErrAbortHandler {
					panic(value)
				}
				slog.Error("request panic recovered")
				panic(http.ErrAbortHandler)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
