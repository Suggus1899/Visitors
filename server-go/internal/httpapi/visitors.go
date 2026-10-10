package httpapi

import (
	"bytes"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	_ "golang.org/x/image/webp"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var cedulaPattern = regexp.MustCompile(`^[VEJPG]-?\d{6,9}$`)

func normalizeCedula(value string) (string, error) {
	s := strings.ToUpper(strings.Join(strings.Fields(value), ""))
	if !cedulaPattern.MatchString(s) {
		return "", errors.New("cédula inválida")
	}
	if s[1] != '-' {
		s = s[:1] + "-" + s[1:]
	}
	return s, nil
}
func photo(value string) ([]byte, error) {
	parts := strings.SplitN(value, ",", 2)
	if len(parts) != 2 {
		return nil, errors.New("INVALID_PHOTO")
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(parts[0], "data:"), ";base64")
	if parts[0] != "data:"+mime+";base64" || (mime != "image/png" && mime != "image/jpeg" && mime != "image/webp") {
		return nil, errors.New("INVALID_PHOTO")
	}
	b, e := base64.StdEncoding.Strict().DecodeString(parts[1])
	if e != nil || len(b) > 5*1024*1024 || base64.StdEncoding.EncodeToString(b) != parts[1] {
		return nil, errors.New("INVALID_PHOTO")
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(b))
	if e != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 16000000 || "image/"+format != mime {
		return nil, errors.New("INVALID_PHOTO")
	}
	if _, _, e = image.Decode(bytes.NewReader(b)); e != nil {
		return nil, errors.New("INVALID_PHOTO")
	}
	return b, nil
}

func (a *App) visitorDTO(v store.Visitor) (map[string]any, error) {
	result := map[string]any{"id": v.ID, "company": v.Company, "isBlocked": v.IsBlocked.Bool, "createdAt": v.CreatedAt, "anonymizedAt": v.AnonymizedAt, "photo_url": v.PhotoUrl, "id_photo_url": v.IDPhotoUrl}
	for key, value := range map[string]string{"cedula": v.EncryptedCedula.String, "firstName": v.FirstName, "lastName": v.LastName, "jobTitle": v.JobTitle.String, "email": v.Email.String, "phone": v.Phone.String, "observations": v.Observations.String} {
		plain, e := security.Decrypt(a.Config.EncryptionKey, value)
		if e != nil {
			return nil, e
		}
		if plain == "" {
			result[key] = nil
		} else {
			result[key] = plain
		}
	}
	result["first_name"] = result["firstName"]
	result["last_name"] = result["lastName"]
	result["job_title"] = result["jobTitle"]
	if v.AnonymizedAt.Valid {
		result["cedula"] = nil
		result["firstName"] = "Anonimizado"
		result["lastName"] = ""
		result["first_name"] = "Anonimizado"
		result["last_name"] = ""
	}
	return result, nil
}
func (a *App) visitorError(w http.ResponseWriter, e error) {
	if errors.Is(e, pgx.ErrNoRows) {
		failure(w, 404, "VISITOR_NOT_FOUND", "Visitante no encontrado")
		return
	}
	a.serverError(w, e)
}
func (a *App) mountVisitors(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate)
		r.Get("/api/v1/visitors/companies", a.companies)
		r.Get("/api/v1/visitors", a.listVisitors)
		r.Get("/api/v1/visitors/{cedula}", a.getVisitor)
		r.Get("/api/v1/visitors/{cedula}/photo", a.getPhoto)
		r.Get("/api/v1/visitors/{cedula}/id-photo", a.getPhoto)
		r.Get("/api/v1/visitors/{cedula}/edit-history", a.editHistory)
		r.Get("/api/v1/visits/{id}/edit-history", a.editHistory)
		r.With(roles("operador", "admin", "root")).Patch("/api/v1/visitors/{cedula}", a.editVisitor)
		r.With(roles("operador", "admin", "root")).Post("/api/v1/visitors/verify-edit-password", a.verifyEditPassword)
	})
}
func (a *App) getVisitor(w http.ResponseWriter, r *http.Request) {
	cedula, e := normalizeCedula(chi.URLParam(r, "cedula"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	v, e := a.Queries.FindVisitor(r.Context(), security.Hash(cedula))
	if e != nil {
		a.visitorError(w, e)
		return
	}
	data, e := a.visitorDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	if r.URL.Query().Get("history") == "true" {
		rows, e := a.Pool.Query(r.Context(), `SELECT * FROM "Visits" WHERE visitor_id=$1 OR visitor_cedula=$2 ORDER BY check_in_time DESC LIMIT 5`, v.ID, v.Cedula)
		if e != nil {
			a.serverError(w, e)
			return
		}
		visits, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visit])
		if e != nil {
			a.serverError(w, e)
			return
		}
		history := []map[string]any{}
		for _, visit := range visits {
			dto, e := a.visitDTO(r, visit)
			if e != nil {
				a.serverError(w, e)
				return
			}
			history = append(history, dto)
		}
		data["history"] = history
	}
	success(w, data)
}
func pagination(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	p, l := 1, 50
	var e error
	if s := r.URL.Query().Get("page"); s != "" {
		p, e = strconv.Atoi(s)
		if e != nil || p < 1 || p > 1000000 {
			failure(w, 400, "VALIDATION_ERROR", "Página inválida")
			return 0, 0, false
		}
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		l, e = strconv.Atoi(s)
		if e != nil || l < 1 || l > 100 {
			failure(w, 400, "VALIDATION_ERROR", "Límite inválido")
			return 0, 0, false
		}
	}
	return p, l, true
}
func (a *App) listVisitors(w http.ResponseWriter, r *http.Request) {
	page, limit, ok := pagination(w, r)
	if !ok {
		return
	}
	company := r.URL.Query().Get("company")
	search := r.URL.Query().Get("search")
	if e := validateSearch(search); e != nil {
		failure(w, 400, "SEARCH_TOO_SHORT", "Escribe al menos tres caracteres")
		return
	}
	if len(company) > 500 || len(search) > 500 {
		failure(w, 400, "VALIDATION_ERROR", "Filtro demasiado largo")
		return
	}
	ids := []int32{}
	var e error
	if search != "" {
		ids, e = a.matchingVisitors(r, search)
		if e != nil {
			a.serverError(w, e)
			return
		}
	}
	where := ` WHERE "anonymizedAt" IS NULL AND ($1='' OR company ILIKE '%'||$1||'%') AND ($2='' OR id=ANY($3) OR company ILIKE '%'||$2||'%')`
	var total int
	e = a.Pool.QueryRow(r.Context(), `SELECT count(*) FROM "Visitors"`+where, pgx.QueryExecModeExec, company, search, ids).Scan(&total)
	if e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT `+profileColumns+` FROM "Visitors"`+where+` ORDER BY id LIMIT $4 OFFSET $5`, pgx.QueryExecModeExec, company, search, ids, limit, (page-1)*limit)
	if e != nil {
		a.serverError(w, e)
		return
	}
	visitors, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visitor])
	if e != nil {
		a.serverError(w, e)
		return
	}
	items := []map[string]any{}
	for _, v := range visitors {
		data, e := a.visitorDTO(v)
		if e != nil {
			a.serverError(w, e)
			return
		}
		items = append(items, data)
	}
	success(w, map[string]any{"visitors": items, "total": total, "page": page, "limit": limit})
}
func (a *App) companies(w http.ResponseWriter, r *http.Request) {
	rows, e := a.Pool.Query(r.Context(), `SELECT DISTINCT company FROM "Visitors" WHERE "anonymizedAt" IS NULL AND company ILIKE '%'||$1||'%' ORDER BY company LIMIT 100`, r.URL.Query().Get("q"))
	if e != nil {
		a.serverError(w, e)
		return
	}
	items, e := pgx.CollectRows(rows, pgx.RowTo[string])
	if e != nil {
		a.serverError(w, e)
		return
	}
	if items == nil {
		items = []string{}
	}
	success(w, items)
}
func (a *App) getPhoto(w http.ResponseWriter, r *http.Request) {
	cedula, e := normalizeCedula(chi.URLParam(r, "cedula"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	v, e := a.Queries.FindVisitor(r.Context(), security.Hash(cedula))
	if e != nil {
		a.visitorError(w, e)
		return
	}
	data := v.PhotoData
	if strings.HasSuffix(r.URL.Path, "/id-photo") {
		data = v.IDPhotoData
	}
	if len(data) == 0 {
		failure(w, 404, "PHOTO_NOT_FOUND", "Fotografía no disponible")
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(data))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Write(data)
}
func (a *App) validEdit(value string) bool {
	if strings.HasPrefix(a.Config.EditPassword, "$2") {
		return security.VerifyPassword(value, a.Config.EditPassword)
	}
	return subtle.ConstantTimeCompare([]byte(value), []byte(a.Config.EditPassword)) == 1
}
func (a *App) verifyEditPassword(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &b) {
		return
	}
	if b.Password == "" || len(b.Password) > 800 {
		failure(w, 400, "VALIDATION_ERROR", "Contraseña requerida")
		return
	}
	success(w, map[string]bool{"valid": a.validEdit(b.Password)})
}
func (a *App) editVisitor(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if !decode(w, r, &body) {
		return
	}
	var password string
	if json.Unmarshal(body["editPassword"], &password) != nil || !a.validEdit(password) {
		failure(w, 403, "INVALID_EDIT_PASSWORD", "Contraseña de edición incorrecta")
		return
	}
	delete(body, "editPassword")
	var visitID *int32
	if raw, ok := body["visitId"]; ok {
		if e := json.Unmarshal(raw, &visitID); e != nil || visitID != nil && *visitID < 0 {
			failure(w, 400, "INVALID_VISIT_CONTEXT", "Visita inválida")
			return
		}
		if visitID != nil && *visitID == 0 {
			visitID = nil
		}
		delete(body, "visitId")
	}
	cedula, e := normalizeCedula(chi.URLParam(r, "cedula"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	fields := map[string]string{"firstName": "first_name", "first_name": "first_name", "lastName": "last_name", "last_name": "last_name", "jobTitle": "job_title", "job_title": "job_title", "company": "company", "email": "email", "phone": "phone", "observations": "observations", "isBlocked": "isBlocked", "photoBase64": "photo_data", "idPhotoBase64": "id_photo_data"}
	if len(body) == 0 {
		failure(w, 400, "VALIDATION_ERROR", "No se enviaron cambios")
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	q := a.Queries.WithTx(tx)
	v, e := q.LockVisitor(r.Context(), security.Hash(cedula))
	if e != nil {
		a.visitorError(w, e)
		return
	}
	if visitID != nil {
		var owns bool
		e = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM "Visits" WHERE id=$1 AND (visitor_id=$2 OR visitor_cedula=$3))`, *visitID, v.ID, v.Cedula).Scan(&owns)
		if e != nil {
			a.serverError(w, e)
			return
		}
		if !owns {
			failure(w, 400, "INVALID_VISIT_CONTEXT", "La visita no pertenece al visitante")
			return
		}
	}
	old, e := a.visitorDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	seen := map[string]bool{}
	for field, raw := range body {
		column, ok := fields[field]
		if !ok || seen[column] {
			failure(w, 400, "VALIDATION_ERROR", "Campo de edición inválido o duplicado")
			return
		}
		seen[column] = true
		var value any
		var oldValue, newValue any
		if field == "isBlocked" {
			if actor(r).Role != "admin" && actor(r).Role != "root" {
				failure(w, 403, "FORBIDDEN", "Solo admin y root pueden bloquear")
				return
			}
			var blocked bool
			if e = json.Unmarshal(raw, &blocked); e != nil || string(raw) == "null" {
				failure(w, 400, "VALIDATION_ERROR", "Estado de bloqueo inválido")
				return
			}
			value = blocked
			oldValue = strconv.FormatBool(v.IsBlocked.Bool)
			newValue = strconv.FormatBool(blocked)
		} else if strings.HasSuffix(field, "Base64") {
			var s string
			if e = json.Unmarshal(raw, &s); e != nil {
				failure(w, 400, "INVALID_PHOTO", "Fotografía inválida")
				return
			}
			value, e = photo(s)
			if e != nil {
				failure(w, 400, "INVALID_PHOTO", "Fotografía inválida")
				return
			}
		} else {
			var s *string
			if e = json.Unmarshal(raw, &s); e != nil {
				failure(w, 400, "VALIDATION_ERROR", "Valor inválido")
				return
			}
			required := column == "first_name" || column == "last_name" || column == "company"
			max := 200
			if column == "first_name" || column == "last_name" {
				max = 100
			}
			if column == "observations" {
				max = 2000
			}
			if column == "phone" {
				max = 30
			}
			if column == "email" {
				max = 254
			}
			if s == nil && required || s != nil && (utf8.RuneCountInString(*s) > max || required && strings.TrimSpace(*s) == "" || column == "email" && !validEmail(*s)) {
				failure(w, 400, "VALIDATION_ERROR", "Datos de edición inválidos")
				return
			}
			key := field
			if field == "first_name" {
				key = "firstName"
			}
			if field == "last_name" {
				key = "lastName"
			}
			if field == "job_title" {
				key = "jobTitle"
			}
			oldValue = old[key]
			if s != nil {
				value = strings.TrimSpace(*s)
				newValue = value
				if column != "company" {
					value, e = security.Encrypt(a.Config.EncryptionKey, value.(string))
					if e != nil {
						a.serverError(w, e)
						return
					}
				}
			}
		}
		_, e = tx.Exec(r.Context(), fmt.Sprintf(`UPDATE "Visitors" SET %s=$1,"updatedAt"=now() WHERE id=$2`, pgx.Identifier{column}.Sanitize()), value, v.ID)
		if e != nil {
			a.serverError(w, e)
			return
		}
		for _, ptr := range []*any{&oldValue, &newValue} {
			if *ptr != nil {
				encrypted, err := security.Encrypt(a.Config.EncryptionKey, fmt.Sprint(*ptr))
				if err != nil {
					a.serverError(w, err)
					return
				}
				*ptr = encrypted
			}
		}
		_, e = tx.Exec(r.Context(), `INSERT INTO "VisitorEditHistories"("visitId","visitorId",field,"oldValue","newValue","editedBy","editedByUsername","editedAt","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())`, visitID, v.ID, field, oldValue, newValue, actor(r).ID, actor(r).Username)
		if e != nil {
			a.serverError(w, e)
			return
		}
	}
	if e = a.indexVisitor(r.Context(), tx, v.ID); e != nil {
		a.serverError(w, e)
		return
	}
	if e = a.audit(r.Context(), q, r, actor(r), "VISITOR_UPDATE", "Visitor", fmt.Sprint(v.ID)); e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	a.publish("visit:visitor-updated", 0)
	v, e = a.Queries.FindVisitor(r.Context(), v.Cedula)
	if e != nil {
		a.visitorError(w, e)
		return
	}
	data, e := a.visitorDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, data)
}
func (a *App) editHistory(w http.ResponseWriter, r *http.Request) {
	query := `SELECT * FROM "VisitorEditHistories" WHERE "visitId"=$1 ORDER BY "editedAt" DESC`
	var value any
	if cedula := chi.URLParam(r, "cedula"); cedula != "" {
		normalized, e := normalizeCedula(cedula)
		if e != nil {
			failure(w, 400, "VALIDATION_ERROR", e.Error())
			return
		}
		v, e := a.Queries.FindVisitor(r.Context(), security.Hash(normalized))
		if e != nil {
			a.visitorError(w, e)
			return
		}
		value = v.ID
		query = `SELECT * FROM "VisitorEditHistories" WHERE "visitorId"=$1 ORDER BY "editedAt" DESC`
	} else {
		id, ok := idParam(w, r)
		if !ok {
			return
		}
		value = id
	}
	rows, e := a.Pool.Query(r.Context(), query, value)
	if e != nil {
		a.serverError(w, e)
		return
	}
	items, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.VisitorEditHistory])
	if e != nil {
		a.serverError(w, e)
		return
	}
	for i := range items {
		for _, field := range []*pgtype.Text{&items[i].OldValue, &items[i].NewValue} {
			if field.Valid {
				field.String, e = security.Decrypt(a.Config.EncryptionKey, field.String)
				if e != nil {
					a.serverError(w, e)
					return
				}
			}
		}
	}
	if items == nil {
		items = []store.VisitorEditHistory{}
	}
	success(w, items)
}
