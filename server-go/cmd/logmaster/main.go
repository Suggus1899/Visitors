package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/backup"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/httpapi"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if e := run(); e != nil {
		slog.Error("command failed", "error", e)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) > 1 && os.Args[1] == "ops" {
		return operations(os.Args[2:])
	}
	if len(os.Args) != 2 {
		return errors.New("usage: logmaster check|adopt|migrate|migrate-test|seed|backup|backup-monitor|serve")
	}
	c, e := config.Load()
	if e != nil {
		return e
	}
	database, e := db.Open(c)
	if e != nil {
		return e
	}
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if e = database.PingContext(ctx); e != nil {
		return errors.New("database connection failed")
	}
	switch os.Args[1] {
	case "serve":
		if e = db.Check(ctx, database); e != nil {
			return e
		}
		app, e := httpapi.New(ctx, c)
		if e != nil {
			return e
		}
		defer app.Pool.Close()
		defer app.StopEvents()
		server := &http.Server{Addr: c.Address, Handler: app.Router(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
		lifetime, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		retentionDone := make(chan struct{})
		go func() { defer close(retentionDone); app.ScheduleRetention(lifetime) }()
		defer func() { stop(); <-retentionDone }()
		completed := make(chan error, 1)
		go func() { completed <- server.ListenAndServe() }()
		slog.Info("Go HTTP server started", "address", c.Address)
		select {
		case e := <-completed:
			if e != http.ErrServerClosed {
				return e
			}
			return nil
		case <-lifetime.Done():
			app.StopEvents()
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			return server.Shutdown(shutdown)
		}
	case "check":
		e = db.Check(ctx, database)
	case "adopt":
		if !c.LocalDevelopment() {
			return errors.New("adoption is restricted to isolated local databases")
		}
		e = db.Adopt(ctx, database)
	case "migrate", "migrate-test":
		if os.Args[1] == "migrate-test" && (!c.LocalTest() || c.Database != "logmaster_go_test") {
			return errors.New("integration preparation requires logmaster_go_test on 127.0.0.1:55432")
		}
		if !c.LocalDevelopment() {
			return errors.New("migration is restricted to isolated local databases")
		}
		e = db.Migrate(ctx, database)
		if e == nil {
			e = db.EncryptHistory(ctx, database, c.EncryptionKey)
		}
		if e == nil {
			e = db.RebuildSearch(ctx, database, c.EncryptionKey, false)
		}
	case "seed":
		if e = db.Check(ctx, database); e != nil {
			return e
		}
		app, e := httpapi.New(ctx, c)
		if e != nil {
			return e
		}
		defer app.Pool.Close()
		defer app.StopEvents()
		return app.Seed(ctx)
	case "backup":
		operation, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		result, e := (backup.Service{Config: c}).Create(operation)
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	case "backup-daily":
		result, e := (backup.Service{Config: c}).Managed(ctx)
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	case "backup-status":
		result, e := backup.ReadStatus()
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	case "rehearse":
		return rehearse(ctx, c)
	case "backup-monitor":
		var bytes int64
		if e = database.QueryRowContext(ctx, `SELECT pg_database_size(current_database())`).Scan(&bytes); e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"database": c.Database, "sizeBytes": bytes})
	default:
		return errors.New("unknown command")
	}
	if e == nil {
		slog.Info("command verified", "command", os.Args[1], "database", c.Database)
	}
	return e
}
