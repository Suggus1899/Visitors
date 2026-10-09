package httpapi

import (
	"errors"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type VisitorData struct {
	FirstName     string `json:"firstName"`
	LastName      string `json:"lastName"`
	Company       string `json:"company"`
	JobTitle      string `json:"jobTitle"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	PhotoBase64   string `json:"photoBase64"`
	IDPhotoBase64 string `json:"idPhotoBase64"`
	Photo         string `json:"photo"`
}
type CheckIn struct {
	VisitorCedula    string       `json:"visitorCedula"`
	Purpose          string       `json:"purpose"`
	PersonToVisit    string       `json:"personToVisit"`
	TargetDepartment string       `json:"targetDepartment"`
	HostPerson       string       `json:"hostPerson"`
	Status           string       `json:"status"`
	Notes            string       `json:"notes"`
	CompanionName    string       `json:"companionName"`
	CompanionCedula  string       `json:"companionCedula"`
	VehicleBrand     string       `json:"vehicleBrand"`
	VehicleModel     string       `json:"vehicleModel"`
	VehiclePlate     string       `json:"vehiclePlate"`
	Area             string       `json:"area"`
	Action           string       `json:"action"`
	Department       string       `json:"department"`
	ArrivalTime      string       `json:"arrivalTime"`
	EntryTime        string       `json:"entryTime"`
	ExitTime         string       `json:"exitTime"`
	VisitorData      *VisitorData `json:"visitorData"`
	Consent          struct {
		Accepted      bool   `json:"accepted"`
		PolicyVersion string `json:"policyVersion"`
		AcceptedAt    string `json:"acceptedAt"`
	} `json:"consent"`
}

func validText(s string, max int, required bool) bool {
	return utf8.RuneCountInString(s) <= max && (!required || strings.TrimSpace(s) != "")
}
func (a *App) visitError(w http.ResponseWriter, e error) {
	var pg *pgconn.PgError
	if errors.As(e, &pg) && pg.Code == "23505" {
		failure(w, 409, "OPEN_VISIT_EXISTS", "Ya existe una visita o salida temporal abierta")
		return
	}
	if errors.Is(e, pgx.ErrNoRows) {
		failure(w, 404, "VISIT_NOT_FOUND", "Visita no encontrada")
		return
	}
	a.serverError(w, e)
}
func (a *App) mountVisits(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate)
		r.Get("/api/v1/visits", a.filteredVisits)
		for _, status := range []string{"active", "waiting", "intermittent"} {
			status := status
			r.Get("/api/v1/visits/"+status, func(w http.ResponseWriter, r *http.Request) { a.statusVisits(w, r, status) })
		}
		r.Group(func(r chi.Router) {
			r.Use(roles("operador", "admin", "root"))
			r.Post("/api/v1/visits/checkin", a.checkIn)
			for path, operation := range map[string]string{"admit": "admit", "checkout": "checkout", "intermittent": "exit", "intermittent-exit": "exit", "reactivate": "reentry", "intermittent-reentry": "reentry"} {
				operation := operation
				r.Post("/api/v1/visits/{id}/"+path, func(w http.ResponseWriter, r *http.Request) { a.transition(w, r, operation) })
			}
		})
	})
}
func (a *App) checkIn(w http.ResponseWriter, r *http.Request) {
	var b CheckIn
	if !decode(w, r, &b) {
		return
	}
	cedula, e := normalizeCedula(b.VisitorCedula)
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	if b.Status == "" {
		b.Status = "active"
	}
	if b.Action == "" {
		b.Action = "Ninguna"
	}
	accepted, e := time.Parse(time.RFC3339Nano, b.Consent.AcceptedAt)
	if !b.Consent.Accepted || e != nil || accepted.After(time.Now().Add(5*time.Minute)) || !validText(b.Consent.PolicyVersion, 20, true) || !validText(b.Purpose, 500, true) || !validText(b.PersonToVisit, 200, true) || !validText(b.TargetDepartment, 200, true) || !validText(b.HostPerson, 200, true) || !validText(b.Notes, 1000, false) || (b.Status != "active" && b.Status != "waiting") || (b.Action != "Carga" && b.Action != "Descarga" && b.Action != "Ninguna") {
		failure(w, 400, "VALIDATION_ERROR", "Datos de visita o consentimiento inválidos")
		return
	}
	for _, field := range []struct {
		value string
		max   int
	}{{b.CompanionName, 200}, {b.CompanionCedula, 255}, {b.VehicleBrand, 100}, {b.VehicleModel, 100}, {b.VehiclePlate, 50}, {b.Area, 200}, {b.Department, 200}} {
		if !validText(field.value, field.max, false) {
			failure(w, 400, "VALIDATION_ERROR", "Datos operativos demasiado largos")
			return
		}
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	q := a.Queries.WithTx(tx)
	hash := security.Hash(cedula)
	if _, e = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, hash); e != nil {
		a.serverError(w, e)
		return
	}
	v, e := q.LockVisitor(r.Context(), hash)
	if errors.Is(e, pgx.ErrNoRows) {
		data := b.VisitorData
		if data == nil || !validText(data.FirstName, 100, true) || !validText(data.LastName, 100, true) || !validText(data.Company, 200, true) || !validText(data.JobTitle, 200, false) || !validText(data.Phone, 30, false) || (data.Email != "" && !validEmail(data.Email)) {
			failure(w, 400, "VALIDATION_ERROR", "Datos del nuevo visitante requeridos")
			return
		}
		values := []string{cedula, data.FirstName, data.LastName, data.JobTitle, data.Email, data.Phone}
		encrypted := []any{}
		for _, value := range values {
			if value == "" {
				encrypted = append(encrypted, nil)
				continue
			}
			cipher, e := security.Encrypt(a.Config.EncryptionKey, value)
			if e != nil {
				a.serverError(w, e)
				return
			}
			encrypted = append(encrypted, cipher)
		}
		var face, document []byte
		if data.PhotoBase64 != "" {
			face, e = photo(data.PhotoBase64)
			if e != nil {
				failure(w, 400, "INVALID_PHOTO", "Fotografía inválida")
				return
			}
		}
		if data.IDPhotoBase64 != "" {
			document, e = photo(data.IDPhotoBase64)
			if e != nil {
				failure(w, 400, "INVALID_PHOTO", "Fotografía de documento inválida")
				return
			}
		}
		var id int32
		e = tx.QueryRow(r.Context(), `INSERT INTO "Visitors"(cedula,encrypted_cedula,first_name,last_name,company,job_title,email,phone,photo_data,id_photo_data,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) RETURNING id`, hash, encrypted[0], encrypted[1], encrypted[2], data.Company, encrypted[3], encrypted[4], encrypted[5], face, document).Scan(&id)
		if e != nil {
			a.visitError(w, e)
			return
		}
		v, e = q.FindVisitorByID(r.Context(), id)
	}
	if e != nil {
		a.visitorError(w, e)
		return
	}
	if v.IsBlocked.Bool {
		failure(w, 403, "VISITOR_BLOCKED", "El visitante está bloqueado")
		return
	}
	now := time.Now().UTC()
	var entry any
	if b.Status == "active" {
		entry = now
	}
	var id int32
	e = tx.QueryRow(r.Context(), `INSERT INTO "Visits"(visitor_cedula,visitor_id,purpose,person_to_visit,status,notes,companion_name,companion_cedula,vehicle_brand,vehicle_model,vehicle_plate,area,action,department,target_department,host_person,arrival_time,entry_time,check_in_time,consent_policy_version,consent_accepted_at,consent_recorded_by,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$17,$19,$20,$21,$17,$17) RETURNING id`, hash, v.ID, b.Purpose, b.PersonToVisit, b.Status, b.Notes, b.CompanionName, b.CompanionCedula, b.VehicleBrand, b.VehicleModel, b.VehiclePlate, b.Area, b.Action, b.Department, b.TargetDepartment, b.HostPerson, now, entry, b.Consent.PolicyVersion, accepted, actor(r).ID).Scan(&id)
	if e == nil {
		e = a.audit(r.Context(), q, r, actor(r), "VISIT_CHECKIN", "Visit", fmt.Sprint(id))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.visitError(w, e)
		return
	}
	a.publish("visit:checked-in", id)
	visit, e := a.Queries.FindVisit(r.Context(), id)
	if e != nil {
		a.visitError(w, e)
		return
	}
	dto, e := a.visitDTO(r, visit)
	if e != nil {
		a.serverError(w, e)
		return
	}
	successStatus(w, 201, dto)
}
func (a *App) transition(w http.ResponseWriter, r *http.Request, operation string) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b struct {
		Notes *string `json:"notes"`
	}
	if r.ContentLength != 0 && !decode(w, r, &b) {
		return
	}
	if b.Notes != nil && !validText(*b.Notes, 1000, false) {
		failure(w, 400, "VALIDATION_ERROR", "Observaciones demasiado largas")
		return
	}
	tx, e := a.Pool.Begin(r.Context())
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	q := a.Queries.WithTx(tx)
	visit, e := q.LockVisit(r.Context(), id)
	if e != nil {
		a.visitError(w, e)
		return
	}
	expected, target := "active", "completed"
	action := "VISIT_CHECKOUT"
	switch operation {
	case "admit":
		expected = "waiting"
		target = "active"
		action = "VISIT_ADMIT"
	case "exit":
		target = "intermittent"
		action = "VISIT_INTERMITTENT_EXIT"
	case "reentry":
		expected = "intermittent"
		target = "active"
		action = "VISIT_REENTRY"
	}
	if string(visit.Status.EnumVisitsStatus) != expected || visit.CheckOutTime.Valid {
		failure(w, 409, "INVALID_VISIT_STATE", "La visita cambió o no permite esta operación")
		return
	}
	now := time.Now().UTC()
	if operation == "exit" {
		_, e = tx.Exec(r.Context(), `INSERT INTO "IntermittentLogs"(visit_id,check_out,notes,registered_by,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$2,$2)`, id, now, b.Notes, actor(r).Username)
	}
	if operation == "reentry" {
		result, err := tx.Exec(r.Context(), `UPDATE "IntermittentLogs" SET re_entry=$2,reentered_by=$3,"updatedAt"=$2 WHERE visit_id=$1 AND re_entry IS NULL`, id, now, actor(r).Username)
		e = err
		if e == nil && result.RowsAffected() != 1 {
			failure(w, 409, "INVALID_VISIT_STATE", "La visita no tiene una única salida temporal abierta")
			return
		}
	}
	if e != nil {
		a.visitError(w, e)
		return
	}
	switch operation {
	case "admit":
		_, e = tx.Exec(r.Context(), `UPDATE "Visits" SET status=$2,entry_time=$3,check_in_time=$3,"updatedAt"=$3 WHERE id=$1`, id, target, now)
	case "checkout":
		_, e = tx.Exec(r.Context(), `UPDATE "Visits" SET status=$2,check_out_time=$3,exit_time=$3,notes=COALESCE($4,notes),"updatedAt"=$3 WHERE id=$1`, id, target, now, b.Notes)
	default:
		_, e = tx.Exec(r.Context(), `UPDATE "Visits" SET status=$2,"updatedAt"=$3 WHERE id=$1`, id, target, now)
	}
	if e == nil {
		e = a.audit(r.Context(), q, r, actor(r), action, "Visit", fmt.Sprint(id))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		a.visitError(w, e)
		return
	}
	eventType := map[string]string{"admit": "visit:admitted", "checkout": "visit:checked-out", "exit": "visit:intermittent-exit", "reentry": "visit:intermittent-reentry"}[operation]
	a.publish(eventType, id)
	visit, e = a.Queries.FindVisit(r.Context(), id)
	if e != nil {
		a.visitError(w, e)
		return
	}
	dto, e := a.visitDTO(r, visit)
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, dto)
}

func (a *App) visitDTO(r *http.Request, v store.Visit) (map[string]any, error) {
	items, e := a.visitDTOs(r, []store.Visit{v})
	if e != nil {
		return nil, e
	}
	return items[0], nil
}
func (a *App) visitData(r *http.Request, v store.Visit, person store.Visitor, found bool) (map[string]any, error) {
	data := map[string]any{"id": v.ID, "purpose": v.Purpose, "personToVisit": v.PersonToVisit, "status": v.Status.EnumVisitsStatus, "notes": v.Notes, "checkInTime": v.CheckInTime, "checkOutTime": v.CheckOutTime, "arrivalTime": v.ArrivalTime, "entryTime": v.EntryTime, "exitTime": v.ExitTime, "targetDepartment": v.TargetDepartment, "hostPerson": v.HostPerson, "companionName": v.CompanionName, "companionCedula": v.CompanionCedula, "vehicleBrand": v.VehicleBrand, "vehicleModel": v.VehicleModel, "vehiclePlate": v.VehiclePlate, "area": v.Area, "action": v.Action.EnumVisitsAction, "department": v.Department}
	if !found || person.AnonymizedAt.Valid {
		data["visitorCedula"] = nil
		data["visitorName"] = "Anonimizado"
		data["visitorCompany"] = "Anonimizado"
		data["company"] = "Anonimizado"
		data["firstName"] = "Anonimizado"
		data["lastName"] = ""
	} else {
		profile, e := a.visitorDTO(person)
		if e != nil {
			return nil, e
		}
		data["visitorCedula"] = profile["cedula"]
		data["firstName"] = profile["firstName"]
		data["lastName"] = profile["lastName"]
		data["visitorName"] = fmt.Sprintf("%v %v", profile["firstName"], profile["lastName"])
		data["company"] = profile["company"]
		data["visitorCompany"] = profile["company"]
		for _, key := range []string{"jobTitle", "email", "phone", "observations", "isBlocked"} {
			data[key] = profile[key]
		}
	}
	duration := 0
	if v.CheckInTime.Valid {
		end := time.Now()
		if v.CheckOutTime.Valid {
			end = v.CheckOutTime.Time
		}
		duration = int(end.Sub(v.CheckInTime.Time).Minutes())
	}
	data["durationMinutes"] = duration
	if v.Status.EnumVisitsStatus == "intermittent" {
		logs, e := a.Queries.VisitLogs(r.Context(), v.ID)
		if e != nil {
			return nil, e
		}
		if logs == nil {
			logs = []store.IntermittentLog{}
		}
		data["intermittent_logs"] = logs
		data["totalIntermittentEvents"] = len(logs)
		intervals := []map[string]any{}
		for _, log := range logs {
			intervals = append(intervals, map[string]any{"id": log.ID, "exitTime": log.CheckOut, "reentryTime": log.ReEntry, "notes": log.Notes})
			if !log.ReEntry.Valid {
				data["intermittentSince"] = log.CheckOut
				data["lastExitTime"] = log.CheckOut
				data["intermittentNotes"] = log.Notes
				data["minutesOutside"] = int(time.Since(log.CheckOut.Time).Minutes())
			}
		}
		data["intervals"] = intervals
	}
	return data, nil
}
func (a *App) statusVisits(w http.ResponseWriter, r *http.Request, status string) {
	rows, e := a.Pool.Query(r.Context(), `SELECT * FROM "Visits" WHERE status::text=$1 AND check_out_time IS NULL ORDER BY check_in_time,id`, status)
	if e != nil {
		a.serverError(w, e)
		return
	}
	visits, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visit])
	if e != nil {
		a.serverError(w, e)
		return
	}
	items, e := a.visitDTOs(r, visits)
	if e != nil {
		a.serverError(w, e)
		return
	}
	success(w, items)
}
