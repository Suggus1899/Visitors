package httpapi

import (
	"encoding/json"
	"errors"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
)

func idParam(w http.ResponseWriter, r *http.Request) (int32, bool) {
	n, e := strconv.ParseInt(chi.URLParam(r, "id"), 10, 32)
	if e != nil || n < 1 {
		failure(w, 400, "VALIDATION_ERROR", "Identificador inválido")
		return 0, false
	}
	return int32(n), true
}
func validEmail(s string) bool {
	address, e := mail.ParseAddress(s)
	return e == nil && address.Address == s && len(s) <= 254 && !strings.ContainsAny(s, "\r\n")
}
func validRole(s string) bool {
	return s == "admin" || s == "operador" || s == "auditor" || s == "demo"
}
func (a *App) mountUsers(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate, roles("root"))
		r.Get("/api/v1/superadmin/users", a.listUsers)
		r.Post("/api/v1/superadmin/users", a.createUser)
		r.Put("/api/v1/superadmin/users/{id}", a.updateUser)
		r.Delete("/api/v1/superadmin/users/{id}", a.deleteUser)
		r.Post("/api/v1/superadmin/users/{id}/reset-password", a.rootResetPassword)
	})
}
func (a *App) listUsers(w http.ResponseWriter, r *http.Request) {
	users, e := a.Queries.ListUsers(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	if users == nil {
		users = []store.ListUsersRow{}
	}
	success(w, users)
}
func (a *App) userError(w http.ResponseWriter, e error) {
	var pg *pgconn.PgError
	if errors.As(e, &pg) && pg.Code == "23505" {
		failure(w, 409, "USERNAME_EXISTS", "El usuario ya existe")
		return
	}
	if errors.Is(e, pgx.ErrNoRows) {
		failure(w, 404, "USER_NOT_FOUND", "Usuario no encontrado")
		return
	}
	a.serverError(w, e)
}
func (a *App) createUser(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Email    string `json:"email"`
		Role     string `json:"role"`
	}
	if !decode(w, r, &b) {
		return
	}
	b.Username = strings.TrimSpace(b.Username)
	if b.Username == "" || len(b.Username) > 100 || !validRole(b.Role) || (b.Email == "" && b.Role != "demo") || (b.Email != "" && !validEmail(b.Email)) {
		failure(w, 400, "VALIDATION_ERROR", "Usuario, rol o correo inválido")
		return
	}
	if e := security.ValidatePassword(b.Password); e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	hash, e := security.PasswordHash(b.Password)
	if e != nil {
		a.serverError(w, e)
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var id int32
	email := pgtype.Text{String: b.Email, Valid: b.Email != ""}
	e = tx.QueryRow(r.Context(), `INSERT INTO "Users"(username,password,email,role,"mustChangePassword","createdAt","updatedAt") VALUES($1,$2,$3,$4,true,now(),now()) RETURNING id`, b.Username, hash, email, b.Role).Scan(&id)
	if e == nil {
		e = a.audit(r.Context(), a.Queries.WithTx(tx), r, actor(r), "SUPERADMIN_CREATE_USER", "User", strconv.Itoa(int(id)))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.userError(w, e)
		return
	}
	success(w, map[string]any{"id": id, "username": b.Username, "email": email, "role": b.Role, "mustChangePassword": true})
}
func (a *App) updateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b struct {
		Username *string         `json:"username"`
		Email    json.RawMessage `json:"email"`
		Role     *string         `json:"role"`
	}
	if !decode(w, r, &b) {
		return
	}
	if b.Username == nil && b.Email == nil && b.Role == nil {
		failure(w, 400, "VALIDATION_ERROR", "No se enviaron cambios")
		return
	}
	if (b.Username != nil && (strings.TrimSpace(*b.Username) == "" || len(*b.Username) > 100)) || (b.Role != nil && !validRole(*b.Role)) {
		failure(w, 400, "VALIDATION_ERROR", "Usuario o rol inválido")
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var username, role string
	var email pgtype.Text
	e = tx.QueryRow(r.Context(), `SELECT username,role::text,email FROM "Users" WHERE id=$1 FOR UPDATE`, id).Scan(&username, &role, &email)
	if e != nil {
		a.userError(w, e)
		return
	}
	if role == "root" && b.Role != nil {
		failure(w, 403, "FORBIDDEN", "No se puede modificar el rol root")
		return
	}
	if b.Username != nil {
		username = strings.TrimSpace(*b.Username)
	}
	if b.Role != nil {
		role = *b.Role
	}
	if b.Email != nil {
		var value *string
		if e = json.Unmarshal(b.Email, &value); e != nil {
			failure(w, 400, "VALIDATION_ERROR", "Correo inválido")
			return
		}
		email = pgtype.Text{}
		if value != nil {
			if !validEmail(*value) {
				failure(w, 400, "VALIDATION_ERROR", "Correo inválido")
				return
			}
			email = text(*value)
		}
	}
	_, e = tx.Exec(r.Context(), `UPDATE "Users" SET username=$2,email=$3,role=$4,"tokenVersion"="tokenVersion"+1,"updatedAt"=now() WHERE id=$1`, id, username, email, role)
	if e == nil {
		e = a.audit(r.Context(), a.Queries.WithTx(tx), r, actor(r), "SUPERADMIN_UPDATE_USER", "User", strconv.Itoa(int(id)))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.userError(w, e)
		return
	}
	success(w, map[string]any{"id": id, "username": username, "email": email, "role": role})
}
func (a *App) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var role string
	e = tx.QueryRow(r.Context(), `SELECT role::text FROM "Users" WHERE id=$1 FOR UPDATE`, id).Scan(&role)
	if e != nil {
		a.userError(w, e)
		return
	}
	if role == "root" {
		failure(w, 403, "CANNOT_DELETE_ROOT", "No se puede eliminar root")
		return
	}
	_, e = tx.Exec(r.Context(), `DELETE FROM "Users" WHERE id=$1`, id)
	if e == nil {
		e = a.audit(r.Context(), a.Queries.WithTx(tx), r, actor(r), "SUPERADMIN_DELETE_USER", "User", strconv.Itoa(int(id)))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.userError(w, e)
		return
	}
	success(w, map[string]string{"message": "Usuario eliminado"})
}
func (a *App) rootResetPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b struct {
		NewPassword string `json:"newPassword"`
	}
	if !decode(w, r, &b) {
		return
	}
	if e := security.ValidatePassword(b.NewPassword); e != nil {
		failure(w, 400, "PASSWORD_POLICY_VIOLATION", e.Error())
		return
	}
	u, e := a.Queries.FindUserByID(r.Context(), id)
	if e != nil {
		a.userError(w, e)
		return
	}
	hash, e := security.PasswordHash(b.NewPassword)
	if e != nil {
		a.serverError(w, e)
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	q := a.Queries.WithTx(tx)
	n, e := q.ChangePassword(r.Context(), store.ChangePasswordParams{ID: id, Password: hash, MustChangePassword: pgtype.Bool{Bool: true, Valid: true}, TokenVersion: u.TokenVersion})
	if e != nil {
		a.userError(w, e)
		return
	}
	if n != 1 {
		failure(w, 409, "SESSION_CHANGED", "La cuenta cambió durante la operación")
		return
	}
	if e = a.audit(r.Context(), q, r, actor(r), "SUPERADMIN_RESET_PASSWORD", "User", strconv.Itoa(int(id))); e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]string{"message": "Contraseña restablecida; cambio obligatorio activado"})
}
