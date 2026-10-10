package main

import (
	"context"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/backup"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/joho/godotenv"
	"os"
	"time"
)

func stagingConfig(c config.Config, file string) (config.Config, error) {
	env, e := godotenv.Read(file)
	if e != nil {
		return c, errors.New("staging environment unavailable")
	}
	stage := c
	stage.Host = env["DB_HOST"]
	stage.Port = env["DB_PORT"]
	stage.Database = env["DB_NAME"]
	stage.User = env["DB_USER"]
	stage.Password = env["DB_PASSWORD"]
	stage.DBSSL = env["DB_SSL"] == "true"
	if stage.Host == "" || stage.Port == "" || stage.User == "" || stage.Password == "" || stage.Database != "logmaster_restore_test" || stage.Host == c.Host && stage.Port == c.Port && stage.Database == c.Database {
		return c, errors.New("explicit independent logmaster_restore_test required")
	}
	return stage, nil
}

func rehearse(ctx context.Context, c config.Config) (err error) {
	started := time.Now()
	archive := ""
	stage, e := stagingConfig(c, os.Getenv("LOGMASTER_STAGING_ENV"))
	if e != nil {
		return e
	}
	defer func() {
		if e := backup.RecordRehearsal(started, archive, err == nil); err == nil {
			err = e
		}
	}()
	service := backup.Service{Config: c}
	statuses, e := backup.ReadStatus()
	if e != nil {
		return e
	}
	latest := statuses["backup"]
	if !latest.Successful || latest.Archive == "" {
		return errors.New("a successful automated backup is required")
	}
	archive = latest.Archive
	password, e := service.SavedPassword(archive)
	if e != nil {
		return e
	}
	data, e := service.Prepare(archive, password)
	if e != nil {
		return e
	}
	if e = backup.RestoreAs(ctx, stage, data, "", true); e != nil {
		return e
	}
	restored, e := db.Open(stage)
	if e != nil {
		return e
	}
	defer restored.Close()
	if e = db.Preflight(ctx, restored, c.EncryptionKey); e != nil {
		return e
	}
	return db.Check(ctx, restored)
}
