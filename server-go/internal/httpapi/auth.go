package httpapi

import (
	"context"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	mail "github.com/wneessen/go-mail"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Session struct {
	ID           int32  `json:"id"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	TokenVersion int32  `json:"tokenVersion"`
	MustChange   bool   `json:"-"`
	jwt.RegisteredClaims
}
type sessionKey struct{}

func actor(r *http.Request) *Session { return r.Context().Value(sessionKey{}).(*Session) }
func text(s string) pgtype.Text      { return pgtype.Text{String: s, Valid: true} }
func (a *App) audit(ctx context.Context, q *store.Queries, r *http.Request, s *Session, action, entity, id string) error {
	agentRunes := []rune(r.UserAgent())
	if len(agentRunes) > 500 {
		agentRunes = agentRunes[:500]
	}
	agent := string(agentRunes)
	return q.WriteAudit(ctx, store.WriteAuditParams{UserId: s.ID, Username: s.Username, Action: action, Entity: entity, EntityId: id, IpAddress: text(a.ClientIP(r)), UserAgent: text(agent), Role: text(s.Role), Method: text(r.Method), Path: text(r.URL.Path)})
}

func (a *App) tokens(s *Session) (map[string]any, error) {
	now := time.Now()
	c := *s
	c.RegisteredClaims = jwt.RegisteredClaims{IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(a.Config.AccessTTL))}
	access, e := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(a.Config.JWTSecret))
	if e != nil {
		return nil, e
	}
	c.ExpiresAt = jwt.NewNumericDate(now.Add(a.Config.RefreshTTL))
	refresh, e := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(a.Config.RefreshSecret))
	if e != nil {
		return nil, e
	}
	return map[string]any{"token": access, "accessToken": access, "refreshToken": refresh, "user": map[string]any{"username": s.Username, "role": s.Role, "mustChangePassword": s.MustChange}}, nil
}
func (a *App) validateToken(ctx context.Context, value string, refresh bool) (*Session, error) {
	secret := a.Config.JWTSecret
	if refresh {
		secret = a.Config.RefreshSecret
	}
	s := &Session{}
	t, e := jwt.ParseWithClaims(value, s, func(_ *jwt.Token) (any, error) { return []byte(secret), nil }, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
	if e != nil || !t.Valid || s.ID <= 0 {
		return nil, errors.New("invalid session")
	}
	u, e := a.Queries.FindUserByID(ctx, s.ID)
	if e != nil || u.TokenVersion != s.TokenVersion {
		return nil, errors.New("revoked session")
	}
	s.Username = u.Username
	s.Role = u.Role
	s.MustChange = u.MustChangePassword
	return s, nil
}
func (a *App) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			failure(w, 401, "UNAUTHORIZED", "Sesión requerida")
			return
		}
		s, e := a.validateToken(r.Context(), strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), false)
		if e != nil {
			failure(w, 401, "UNAUTHORIZED", "Sesión inválida o revocada")
			return
		}
		if s.MustChange && r.URL.Path != "/api/v1/auth/change-password" {
			failure(w, 403, "PASSWORD_CHANGE_REQUIRED", "Debes cambiar tu contraseña")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, s)))
	})
}
func roles(allowed ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, role := range allowed {
				if actor(r).Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			failure(w, 403, "FORBIDDEN", "No tienes permiso para esta operación")
		})
	}
}

func (a *App) mountAuth(router chi.Router) {
	router.Post("/api/v1/auth/login", a.login)
	router.Post("/api/v1/auth/forgot-password", a.forgotPassword)
	router.Post("/api/v1/auth/reset-password", a.resetPassword)
	router.Post("/api/v1/auth/refresh", a.refresh)
	router.With(a.authenticate).Post("/api/v1/auth/change-password", a.changePassword)
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Username) < 1 || len(body.Username) > 100 || len(body.Password) < 1 || len(body.Password) > 800 {
		failure(w, 400, "VALIDATION_ERROR", "Usuario y contraseña requeridos")
		return
	}
	if !a.allowRequest("account:"+a.ClientIP(r)+":"+body.Username, 20, 15*time.Minute, time.Now()) {
		w.Header().Set("Retry-After", "900")
		failure(w, 429, "RATE_LIMITED", "Demasiados intentos para esta cuenta")
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	q := a.Queries.WithTx(tx)
	u, e := q.LockUser(r.Context(), body.Username)
	if errors.Is(e, pgx.ErrNoRows) {
		security.VerifyPassword(body.Password, "$2a$12$McrB/iIusUSh84evLjMHJONKe/qFs63lZ/sJiXaGNTKNWxguQv98a")
		failure(w, 401, "AUTH_FAILED", "Credenciales inválidas")
		return
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	if u.LockedUntil.Valid && u.LockedUntil.Time.After(time.Now()) {
		failure(w, 403, "ACCOUNT_LOCKED", "Cuenta bloqueada temporalmente")
		return
	}
	if !security.VerifyPassword(body.Password, u.Password) {
		attempts := u.LoginAttempts + 1
		if u.LockedUntil.Valid && u.LockedUntil.Time.Before(time.Now()) {
			attempts = 1
		}
		until := pgtype.Timestamptz{}
		if attempts >= int32(a.Config.MaxLoginAttempts) {
			until = pgtype.Timestamptz{Time: time.Now().Add(time.Duration(a.Config.LockoutMinutes) * time.Minute), Valid: true}
		}
		if e = q.LoginFailed(r.Context(), store.LoginFailedParams{ID: u.ID, LoginAttempts: pgtype.Int4{Int32: attempts, Valid: true}, LockedUntil: until}); e == nil {
			e = tx.Commit(r.Context())
		}
		if e != nil {
			a.serverError(w, e)
			return
		}
		failure(w, 401, "AUTH_FAILED", "Credenciales inválidas")
		return
	}
	s := &Session{ID: u.ID, Username: u.Username, Role: u.Role, TokenVersion: u.TokenVersion, MustChange: u.MustChangePassword}
	if e = q.LoginSucceeded(r.Context(), u.ID); e == nil {
		e = a.audit(r.Context(), q, r, s, "LOGIN", "User", strconv.Itoa(int(u.ID)))
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	result, e := a.tokens(s)
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, result)
}
func (a *App) refresh(w http.ResponseWriter, r *http.Request) {
	var b struct {
		RefreshToken string `json:"refreshToken"`
	}
	if !decode(w, r, &b) {
		return
	}
	s, e := a.validateToken(r.Context(), b.RefreshToken, true)
	if e != nil {
		failure(w, 401, "INVALID_TOKEN", "Sesión de renovación inválida")
		return
	}
	data, e := a.tokens(s)
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, data)
}
func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
		ConfirmPassword string `json:"confirmPassword"`
	}
	if !decode(w, r, &b) {
		return
	}
	if e := security.ValidatePassword(b.NewPassword); e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	if b.ConfirmPassword != "" && b.ConfirmPassword != b.NewPassword {
		failure(w, 400, "VALIDATION_ERROR", "Las contraseñas no coinciden")
		return
	}
	s := actor(r)
	u, e := a.Queries.FindUserByID(r.Context(), s.ID)
	if e != nil {
		a.serverError(w, e)
		return
	}
	if !security.VerifyPassword(b.CurrentPassword, u.Password) {
		failure(w, 401, "INVALID_PASSWORD", "Contraseña actual incorrecta")
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
	n, e := q.ChangePassword(r.Context(), store.ChangePasswordParams{ID: s.ID, Password: hash, MustChangePassword: pgtype.Bool{Valid: true}, TokenVersion: s.TokenVersion})
	if e != nil {
		a.serverError(w, e)
		return
	}
	if n != 1 {
		failure(w, 409, "SESSION_CHANGED", "La sesión cambió durante la operación")
		return
	}
	if e = a.audit(r.Context(), q, r, s, "PASSWORD_CHANGE", "User", strconv.Itoa(int(s.ID))); e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]string{"message": "Contraseña actualizada"})
}

func sendResetEmail(ctx context.Context, to, token string) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		return errors.New("SMTP is not configured")
	}
	port, e := strconv.Atoi(os.Getenv("SMTP_PORT"))
	if e != nil {
		return errors.New("invalid SMTP port")
	}
	options := []mail.Option{mail.WithPort(port), mail.WithTimeout(10 * time.Second)}
	mode := os.Getenv("SMTP_TLS_MODE")
	if mode != "" && mode != "local" && mode != "starttls" && mode != "implicit" {
		return errors.New("invalid SMTP_TLS_MODE")
	}
	local := host == "127.0.0.1" || host == "localhost" || host == "::1"
	if mode == "local" && (os.Getenv("NODE_ENV") == "production" || (!local && host != "mailpit")) {
		return errors.New("local SMTP restricted to isolated validation")
	}
	if mode == "local" || mode == "" && local && os.Getenv("NODE_ENV") != "production" {
		options = append(options, mail.WithTLSPolicy(mail.NoTLS))
	} else {
		options = append(options, mail.WithTLSPolicy(mail.TLSMandatory))
		if mode == "implicit" || mode == "" && os.Getenv("SMTP_SECURE") == "true" {
			options = append(options, mail.WithSSL())
		}
		options = append(options, mail.WithSMTPAuth(mail.SMTPAuthPlain), mail.WithUsername(os.Getenv("SMTP_USER")), mail.WithPassword(os.Getenv("SMTP_PASSWORD")))
	}
	client, e := mail.NewClient(host, options...)
	if e != nil {
		return e
	}
	msg := mail.NewMsg()
	if e = msg.From(os.Getenv("EMAIL_FROM")); e != nil {
		return e
	}
	if e = msg.To(to); e != nil {
		return e
	}
	msg.Subject("Restablecimiento de contraseña — LogMaster")
	link := strings.TrimRight(os.Getenv("APP_URL"), "/") + "/#/reset-password?token=" + url.QueryEscape(token)
	msg.SetBodyString(mail.TypeTextPlain, "Solicitud de restablecimiento de contraseña. El enlace vence en 15 minutos y tiene un solo uso:\n"+link)
	return client.DialAndSendWithContext(ctx, msg)
}
func (a *App) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Username string `json:"username"`
	}
	if !decode(w, r, &b) {
		return
	}
	if len(b.Username) < 1 || len(b.Username) > 100 {
		failure(w, 400, "VALIDATION_ERROR", "Usuario requerido")
		return
	}
	u, e := a.Queries.FindUser(r.Context(), b.Username)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		a.serverError(w, e)
		return
	}
	if e == nil && u.Email.Valid {
		token, e := security.RandomToken()
		if e != nil {
			a.serverError(w, e)
			return
		}
		hash := security.Hash(token)
		e = a.Queries.SaveResetToken(r.Context(), store.SaveResetTokenParams{ID: u.ID, ResetToken: text(hash), ResetTokenExpiry: pgtype.Timestamptz{Time: time.Now().Add(15 * time.Minute), Valid: true}})
		if e != nil {
			a.serverError(w, e)
			return
		}
		if e = sendResetEmail(r.Context(), u.Email.String, token); e != nil {
			_, _ = a.Pool.Exec(r.Context(), `UPDATE "Users" SET "resetToken"=null,"resetTokenExpiry"=null WHERE id=$1 AND "resetToken"=$2`, u.ID, hash)
		}
	}
	success(w, map[string]string{"message": "Si la cuenta existe y tiene correo, recibirás instrucciones de recuperación."})
}
func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if !decode(w, r, &b) {
		return
	}
	if len(b.Token) != 64 {
		failure(w, 400, "INVALID_TOKEN", "Token inválido o vencido")
		return
	}
	if e := security.ValidatePassword(b.NewPassword); e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
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
	u, e := q.ConsumeResetToken(r.Context(), store.ConsumeResetTokenParams{ResetToken: text(security.Hash(b.Token)), Password: hash})
	if errors.Is(e, pgx.ErrNoRows) {
		failure(w, 400, "INVALID_TOKEN", "Token inválido o vencido")
		return
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	s := &Session{ID: u.ID, Username: u.Username, Role: u.Role}
	if e = a.audit(r.Context(), q, r, s, "PASSWORD_RESET", "User", fmt.Sprint(u.ID)); e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]string{"message": "Contraseña restablecida"})
}
