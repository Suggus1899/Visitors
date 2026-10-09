package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
	"strings"
)

func (a *App) mountPrivacy(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate)
		r.With(roles("admin", "root", "auditor")).Get("/api/v1/privacy/arco-requests", a.arcoList)
		r.With(roles("admin", "root", "auditor")).Get("/api/v1/privacy/subjects/{cedula}", a.subjectAccess)
		r.With(roles("admin", "root")).Patch("/api/v1/privacy/arco-requests/{id}/status", a.arcoStatus)
		r.With(roles("admin", "root")).Delete("/api/v1/privacy/subjects/{cedula}", a.subjectCancel)
		r.With(roles("operador", "admin", "root")).Post("/api/v1/privacy/arco-requests", a.arcoCreate)
		r.With(roles("operador", "admin", "root")).Post("/api/v1/privacy/subjects/{cedula}/opposition", a.arcoCreate)
		r.With(roles("operador", "admin", "root")).Patch("/api/v1/privacy/subjects/{cedula}", a.subjectRectify)
	})
}

type arcoBody struct {
	RequestType     string         `json:"requestType"`
	Cedula          string         `json:"cedula"`
	RequestedByName string         `json:"requestedByName"`
	ContactEmail    string         `json:"contactEmail"`
	Reason          string         `json:"reason"`
	RequestPayload  map[string]any `json:"requestPayload"`
}

func (a *App) arcoDTO(v store.ArcoRequest) (map[string]any, error) {
	cedula, e := security.Decrypt(a.Config.EncryptionKey, v.SubjectCedulaEncrypted.String)
	if e != nil {
		return nil, e
	}
	var payload any
	if v.RequestPayload.Valid && json.Unmarshal([]byte(v.RequestPayload.String), &payload) != nil {
		return nil, errors.New("invalid stored request payload")
	}
	var publicCedula any
	if cedula != "" {
		publicCedula = cedula
	}
	return map[string]any{"id": v.ID, "requestType": v.RequestType, "subjectCedula": publicCedula, "requestedByName": v.RequestedByName, "requestedByUserId": v.RequestedByUserId, "contactEmail": v.ContactEmail, "reason": v.Reason, "requestPayload": payload, "status": v.Status, "resolutionNotes": v.ResolutionNotes, "resolvedAt": v.ResolvedAt, "createdAt": v.CreatedAt, "updatedAt": v.UpdatedAt}, nil
}
func (a *App) arcoCreate(w http.ResponseWriter, r *http.Request) {
	var b arcoBody
	if !decode(w, r, &b) {
		return
	}
	if path := chi.URLParam(r, "cedula"); path != "" {
		b.Cedula = path
		b.RequestType = "opposition"
	}
	cedula, e := normalizeCedula(b.Cedula)
	allowed := b.RequestType == "access" || b.RequestType == "rectification" || b.RequestType == "cancellation" || b.RequestType == "opposition"
	if e != nil || !allowed || !validText(b.RequestedByName, 120, true) || len([]rune(strings.TrimSpace(b.RequestedByName))) < 2 || !validText(b.ContactEmail, 200, false) || (b.ContactEmail != "" && !validEmail(b.ContactEmail)) || !validText(b.Reason, 1000, false) {
		failure(w, 400, "VALIDATION_ERROR", "Solicitud de privacidad inválida")
		return
	}
	var payload any
	if b.RequestPayload != nil {
		value, e := json.Marshal(b.RequestPayload)
		if e != nil {
			failure(w, 400, "VALIDATION_ERROR", "Contenido inválido")
			return
		}
		payload = string(value)
	}
	encrypted, e := security.Encrypt(a.Config.EncryptionKey, cedula)
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
	if _, e = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, security.Hash(cedula)); e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := tx.Query(r.Context(), `INSERT INTO "ArcoRequests"("requestType","subjectCedulaHash","subjectCedulaEncrypted","requestedByName","requestedByUserId","contactEmail",reason,"requestPayload",status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),$8,'pending',now(),now()) RETURNING *`, b.RequestType, security.Hash(cedula), encrypted, strings.TrimSpace(b.RequestedByName), actor(r).ID, b.ContactEmail, b.Reason, payload)
	if e != nil {
		a.serverError(w, e)
		return
	}
	v, e := pgx.CollectOneRow(rows, pgx.RowToStructByName[store.ArcoRequest])
	if e == nil {
		e = a.audit(r.Context(), a.Queries.WithTx(tx), r, actor(r), "ARCO_REQUEST_CREATED", "ArcoRequest", fmt.Sprint(v.ID))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	dto, e := a.arcoDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	successStatus(w, 201, dto)
}
func (a *App) arcoList(w http.ResponseWriter, r *http.Request) {
	page, limit, ok := pagination(w, r)
	if !ok {
		return
	}
	if r.URL.Query().Get("limit") == "" {
		limit = 20
	}
	q := r.URL.Query()
	status, kind, search := q.Get("status"), q.Get("requestType"), q.Get("search")
	if status != "" && status != "pending" && status != "in_progress" && status != "completed" && status != "rejected" || kind != "" && kind != "access" && kind != "rectification" && kind != "cancellation" && kind != "opposition" || len(search) > 500 {
		failure(w, 400, "VALIDATION_ERROR", "Filtros inválidos")
		return
	}
	var hash string
	if normalized, e := normalizeCedula(search); e == nil {
		hash = security.Hash(normalized)
	}
	where := ` WHERE ($1='' OR status::text=$1) AND ($2='' OR "requestType"::text=$2) AND ($3='' OR "requestedByName" ILIKE '%'||$3||'%' OR "contactEmail" ILIKE '%'||$3||'%' OR reason ILIKE '%'||$3||'%' OR "subjectCedulaHash"=$4)`
	var total int
	if e := a.Pool.QueryRow(r.Context(), `SELECT count(*) FROM "ArcoRequests"`+where, status, kind, search, hash).Scan(&total); e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT * FROM "ArcoRequests"`+where+` ORDER BY "createdAt" DESC,id DESC LIMIT $5 OFFSET $6`, status, kind, search, hash, limit, (page-1)*limit)
	if e != nil {
		a.serverError(w, e)
		return
	}
	values, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.ArcoRequest])
	if e != nil {
		a.serverError(w, e)
		return
	}
	requests := []map[string]any{}
	for _, v := range values {
		dto, e := a.arcoDTO(v)
		if e != nil {
			a.serverError(w, e)
			return
		}
		requests = append(requests, dto)
	}
	success(w, map[string]any{"requests": requests, "pagination": map[string]int{"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) / limit}})
}
func (a *App) arcoStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b struct {
		Status          string  `json:"status"`
		ResolutionNotes *string `json:"resolutionNotes"`
	}
	if !decode(w, r, &b) {
		return
	}
	if b.Status != "pending" && b.Status != "in_progress" && b.Status != "completed" && b.Status != "rejected" || b.ResolutionNotes != nil && !validText(*b.ResolutionNotes, 1000, false) {
		failure(w, 400, "VALIDATION_ERROR", "Estado inválido")
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	rows, e := tx.Query(r.Context(), `UPDATE "ArcoRequests" SET status=$2,"resolutionNotes"=CASE WHEN "subjectCedulaEncrypted" IS NULL THEN NULL ELSE $3 END,"resolvedAt"=CASE WHEN $2 IN ('completed','rejected') THEN now() ELSE NULL END,"updatedAt"=now() WHERE id=$1 RETURNING *`, id, b.Status, b.ResolutionNotes)
	if e != nil {
		a.serverError(w, e)
		return
	}
	v, e := pgx.CollectOneRow(rows, pgx.RowToStructByName[store.ArcoRequest])
	if errors.Is(e, pgx.ErrNoRows) {
		failure(w, 404, "NOT_FOUND", "Solicitud no encontrada")
		return
	}
	if e == nil {
		e = a.audit(r.Context(), a.Queries.WithTx(tx), r, actor(r), "ARCO_REQUEST_STATUS_UPDATED", "ArcoRequest", fmt.Sprint(id))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	dto, e := a.arcoDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, dto)
}
func (a *App) subjectRectify(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if !decode(w, r, &body) {
		return
	}
	for field := range body {
		switch field {
		case "editPassword", "visitId", "firstName", "lastName", "company", "jobTitle", "email", "phone":
		default:
			failure(w, 400, "VALIDATION_ERROR", "Campo de rectificación inválido")
			return
		}
	}
	data, e := json.Marshal(body)
	if e != nil {
		a.serverError(w, e)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(data))
	a.editVisitor(w, r)
}
func (a *App) subjectAccess(w http.ResponseWriter, r *http.Request) {
	_, limit, ok := pagination(w, r)
	if !ok {
		return
	}
	cedula, e := normalizeCedula(chi.URLParam(r, "cedula"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	// A row lock keeps access and cancellation from returning different snapshots.
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
	profile, e := a.visitorDTO(v)
	if e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := tx.Query(r.Context(), `SELECT * FROM "Visits" WHERE visitor_id=$1 OR visitor_cedula=$2 ORDER BY check_in_time DESC,id DESC LIMIT $3`, v.ID, v.Cedula, limit)
	if e != nil {
		a.serverError(w, e)
		return
	}
	visits, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visit])
	if e == nil {
		e = a.audit(r.Context(), q, r, actor(r), "ARCO_ACCESS_EXECUTED", "Visitor", fmt.Sprint(v.ID))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	items := []map[string]any{}
	for _, v := range visits {
		items = append(items, map[string]any{"id": v.ID, "status": v.Status.EnumVisitsStatus, "purpose": v.Purpose, "personToVisit": v.PersonToVisit, "checkInTime": v.CheckInTime, "checkOutTime": v.CheckOutTime, "notes": v.Notes})
	}
	success(w, map[string]any{"visitor": profile, "visits": items})
}
func (a *App) subjectCancel(w http.ResponseWriter, r *http.Request) {
	cedula, e := normalizeCedula(chi.URLParam(r, "cedula"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	hash := security.Hash(cedula)
	reference, e := security.RandomToken()
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
	if _, e = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, hash); e != nil {
		a.serverError(w, e)
		return
	}
	q := a.Queries.WithTx(tx)
	v, e := q.LockVisitor(r.Context(), hash)
	if e != nil {
		a.visitorError(w, e)
		return
	}
	rows, e := tx.Query(r.Context(), `SELECT * FROM "Visits" WHERE visitor_id=$1 OR visitor_cedula=$2 FOR UPDATE`, v.ID, hash)
	if e != nil {
		a.serverError(w, e)
		return
	}
	visits, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visit])
	if e != nil {
		a.serverError(w, e)
		return
	}
	ids := []int32{}
	entityIDs := []string{}
	for _, visit := range visits {
		if visit.Status.EnumVisitsStatus != "completed" {
			failure(w, 409, "OPEN_VISIT_EXISTS", "Cierre las visitas abiertas antes de cancelar los datos")
			return
		}
		ids = append(ids, visit.ID)
		entityIDs = append(entityIDs, fmt.Sprint(visit.ID))
	}
	statements := []struct {
		sql  string
		args []any
	}{
		{`UPDATE "VisitorEditHistories" SET "oldValue"=NULL,"newValue"=NULL WHERE "visitorId"=$1 OR "visitId"=ANY($2)`, []any{v.ID, ids}},
		{`UPDATE "IntermittentLogs" SET notes=NULL,"updatedAt"=now() WHERE visit_id=ANY($1)`, []any{ids}},
		{`UPDATE "ActivityLogs" SET "entityId"=$1,details='Datos anonimizados',path=NULL,"ipAddress"=NULL,"userAgent"=NULL WHERE (entity='Visitor' AND "entityId"=ANY($2)) OR (entity='Visit' AND "entityId"=ANY($3)) OR (entity='ArcoRequest' AND "entityId" IN (SELECT id::text FROM "ArcoRequests" WHERE "subjectCedulaHash"=$4)) OR path LIKE '%'||$5||'%' OR details LIKE '%'||$5||'%'`, []any{reference, []string{cedula, hash, fmt.Sprint(v.ID)}, entityIDs, hash, cedula}},
		{`UPDATE "Visits" SET visitor_id=$1,visitor_cedula=$2,purpose='Anonimizado',person_to_visit='Anonimizado',notes=NULL,companion_name=NULL,companion_cedula=NULL,vehicle_brand=NULL,vehicle_model=NULL,vehicle_plate=NULL,host_person=NULL,target_department=NULL,department=NULL,area=NULL,"updatedAt"=now() WHERE visitor_id=$1 OR visitor_cedula=$3`, []any{v.ID, reference, hash}},
		{`UPDATE "ArcoRequests" SET "subjectCedulaHash"=$2,"subjectCedulaEncrypted"=NULL,"requestedByName"='Anonimizado',"contactEmail"=NULL,reason=NULL,"requestPayload"=NULL,"resolutionNotes"=NULL,"updatedAt"=now() WHERE "subjectCedulaHash"=$1`, []any{hash, reference}},
		{`UPDATE "Visitors" SET cedula=$2,encrypted_cedula=NULL,"anonymizedAt"=now(),first_name='Anonimizado',last_name='',company='Anonimizado',job_title=NULL,email=NULL,phone=NULL,photo_data=NULL,id_photo_data=NULL,photo_url=NULL,id_photo_url=NULL,observations=NULL,"isBlocked"=false,"updatedAt"=now() WHERE id=$1`, []any{v.ID, reference}},
		{`INSERT INTO "ArcoRequests"("requestType","subjectCedulaHash","requestedByName","requestedByUserId",status,"resolvedAt","createdAt","updatedAt") VALUES('cancellation',$1,'Anonimizado',$2,'completed',now(),now(),now())`, []any{reference, actor(r).ID}},
	}
	for _, statement := range statements {
		if _, e = tx.Exec(r.Context(), statement.sql, statement.args...); e != nil {
			a.serverError(w, e)
			return
		}
	}
	auditRequest := r.Clone(r.Context())
	auditURL := *r.URL
	auditRequest.URL = &auditURL
	auditRequest.URL.Path = "/api/v1/privacy/subjects/" + reference
	if e = a.audit(r.Context(), q, auditRequest, actor(r), "ARCO_CANCELLATION_EXECUTED", "Visitor", reference); e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]any{"message": "Datos personales cancelados; eventos conservados de forma anónima"})
	a.publish("visit:anonymized", 0)
}
