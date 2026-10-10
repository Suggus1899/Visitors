package httpapi

import (
	"context"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/internal/backup"
	"github.com/go-chi/chi/v5"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func (a *App) mountBackups(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate, roles("admin", "root"))
		r.Get("/api/v1/backups", a.listBackups)
		r.Post("/api/v1/backups", a.createBackup)
		r.Post("/api/v1/backups/{filename}/restore", a.restoreBackup)
	})
}
func (a *App) listBackups(w http.ResponseWriter, r *http.Request) {
	files, e := (backup.Service{Config: a.Config}).List()
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, files)
}
func (a *App) createBackup(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	service := backup.Service{Config: a.Config}
	result, e := service.Create(ctx)
	if e != nil {
		a.serverError(w, e)
		return
	}
	if e = a.audit(r.Context(), a.Queries, r, actor(r), "BACKUP_CREATED", "Backup", filepath.Base(result.FilePath)); e != nil {
		if cleanup := service.Remove(filepath.Base(result.FilePath)); cleanup != nil {
			a.serverError(w, cleanup)
			return
		}
		a.serverError(w, e)
		return
	}
	success(w, map[string]any{"filePath": result.FilePath, "restorePassword": result.RestorePassword, "message": "Guarde la contraseña de restauración; se muestra una sola vez"})
}
func (a *App) restoreBackup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RestorePassword string `json:"restorePassword"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.RestorePassword) < 1 || len(body.RestorePassword) > 200 {
		failure(w, 400, "MISSING_PASSWORD", "Contraseña de restauración requerida")
		return
	}
	name := chi.URLParam(r, "filename")
	data, e := (backup.Service{Config: a.Config}).Prepare(name, body.RestorePassword)
	if e != nil {
		switch {
		case errors.Is(e, backup.ErrName):
			failure(w, 400, "INVALID_FILENAME", "Nombre de respaldo inválido")
		case errors.Is(e, backup.ErrPassword):
			failure(w, 401, "INVALID_PASSWORD", "Contraseña incorrecta")
		case errors.Is(e, backup.ErrMetadata):
			failure(w, 409, "MISSING_METADATA", "Metadatos obligatorios ausentes o inválidos")
		case errors.Is(e, os.ErrNotExist):
			failure(w, 404, "NOT_FOUND", "Respaldo no encontrado")
		default:
			a.serverError(w, e)
		}
		return
	}
	if !a.Config.LocalTest() || a.Config.Database != "logmaster_restore_test" {
		failure(w, 409, "RESTORE_TARGET_NOT_ALLOWED", "La validación de restauraciones requiere logmaster_restore_test")
		return
	}
	if e = a.audit(r.Context(), a.Queries, r, actor(r), "BACKUP_RESTORE_REQUESTED", "Backup", name); e != nil {
		a.serverError(w, e)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	root := actor(r).Username
	if e = backup.RestoreAs(ctx, a.Config, data, root, false); e != nil {
		a.serverError(w, e)
		return
	}
	a.publish("visit:restored", 0)
	success(w, map[string]any{"message": "Respaldo restaurado en la base de ensayo", "filename": name})
}
