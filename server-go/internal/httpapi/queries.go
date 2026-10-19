package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	index "github.com/Suggus1899/Visitors/server-go/internal/search"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/url"
	"strings"
)

type visitQueryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type visitSort struct {
	field, orderBy string
}

func parseVisitSort(values url.Values) (visitSort, error) {
	if len(values["sortField"]) > 1 || len(values["sortDirection"]) > 1 {
		return visitSort{}, fmt.Errorf("ordenamiento inválido")
	}
	field := values.Get("sortField")
	if field == "" {
		field = "check_in_time"
	}
	direction := strings.ToLower(values.Get("sortDirection"))
	if direction == "" {
		direction = "desc"
	}
	columns := map[string]string{
		"arrival_time": "v.arrival_time", "check_in_time": "v.check_in_time", "entry_time": "v.entry_time",
		"exit_time": "v.exit_time", "check_out_time": "v.check_out_time", "status": "v.status", "company": "p.company",
	}
	column, ok := columns[field]
	if !ok || direction != "asc" && direction != "desc" {
		return visitSort{}, fmt.Errorf("ordenamiento inválido")
	}
	return visitSort{field: field, orderBy: fmt.Sprintf("%s %s NULLS LAST, v.id DESC", column, strings.ToUpper(direction))}, nil
}

func visitExportLimit(format string) (int, error) {
	switch format {
	case "pdf":
		return 2000, nil
	case "xlsx":
		return 20000, nil
	default:
		return 0, fmt.Errorf("formato de exportación inválido")
	}
}

const profileColumns = `id,"anonymizedAt",cedula,encrypted_cedula,first_name,last_name,company,job_title,photo_url,id_photo_url,email,phone,"updatedAt",NULL::bytea AS photo_data,NULL::bytea AS id_photo_data,"isBlocked",observations,"createdAt"`

// Verify indexed candidates after decryption, without loading photographs.
func (a *App) matchingVisitors(r *http.Request, search string) ([]int32, error) {
	return a.matchingVisitorsWith(r, search, a.Pool)
}

func (a *App) matchingVisitorsWith(r *http.Request, search string, query visitQueryer) ([]int32, error) {
	if e := validateSearch(search); e != nil {
		return nil, e
	}
	tokens := index.Tokens(a.Config.EncryptionKey, search)
	rows, e := query.Query(r.Context(), `SELECT p.id,p.first_name,p.last_name,p.encrypted_cedula FROM "Visitors" p JOIN (SELECT visitor_id FROM "VisitorSearchTokens" WHERE token=ANY($1::bytea[]) GROUP BY visitor_id HAVING count(*)=$2) matches ON matches.visitor_id=p.id WHERE p."anonymizedAt" IS NULL`, pgx.QueryExecModeExec, tokens, len(tokens))
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	ids := []int32{}
	needle := index.Normalize(search)
	for rows.Next() {
		var id int32
		var first, last string
		var cedula *string
		if e = rows.Scan(&id, &first, &last, &cedula); e != nil {
			return nil, e
		}
		first, e = security.Decrypt(a.Config.EncryptionKey, first)
		if e != nil {
			return nil, e
		}
		last, e = security.Decrypt(a.Config.EncryptionKey, last)
		if e != nil {
			return nil, e
		}
		plain := ""
		if cedula != nil {
			plain, e = security.Decrypt(a.Config.EncryptionKey, *cedula)
			if e != nil {
				return nil, e
			}
		}
		haystack := strings.ToLower(first + " " + last + " " + plain)
		if strings.Contains(haystack, needle) {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}
func (a *App) visitFilter(r *http.Request) (sqlFilter, error) {
	return a.visitFilterWith(r, a.Pool)
}

func (a *App) visitFilterWith(r *http.Request, query visitQueryer) (sqlFilter, error) {
	q := r.URL.Query()
	f := sqlFilter{}
	start, end, e := dateRange(q)
	if e != nil {
		return f, e
	}
	if start != nil {
		f.add("v.check_in_time>=?", *start)
	}
	if end != nil {
		f.add("v.check_in_time<?", *end)
	}
	if status := q.Get("status"); status != "" {
		if status != "active" && status != "waiting" && status != "intermittent" && status != "completed" && status != "cancelled" {
			return f, fmt.Errorf("estado inválido")
		}
		f.add("v.status=?::\"enum_Visits_status\"", status)
	}
	if company := q.Get("company"); company != "" {
		if len(company) > 500 {
			return f, fmt.Errorf("empresa inválida")
		}
		f.add("p.company ILIKE '%'||?||'%'", company)
	}
	if cedula := q.Get("visitorCedula"); cedula != "" {
		value, e := normalizeCedula(cedula)
		if e != nil {
			return f, e
		}
		f.add("v.visitor_cedula=?", security.IdentityHash(a.Config.EncryptionKey, value))
	}
	if search := q.Get("search"); search != "" {
		if len(search) > 500 {
			return f, fmt.Errorf("búsqueda demasiado larga")
		}
		ids, e := a.matchingVisitorsWith(r, search, query)
		if e != nil {
			return f, e
		}
		f.add(`(v.purpose ILIKE '%'||?||'%' OR v.person_to_visit ILIKE '%'||?||'%' OR v.notes ILIKE '%'||?||'%' OR v.host_person ILIKE '%'||?||'%' OR v.target_department ILIKE '%'||?||'%' OR p.company ILIKE '%'||?||'%' OR p.id=ANY(`+fmt.Sprintf("$%d", len(f.args)+2)+`))`, search)
		f.args = append(f.args, ids)
	}
	return f, nil
}
func (a *App) filteredVisits(w http.ResponseWriter, r *http.Request) {
	sort, e := parseVisitSort(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	page, limit, ok := pagination(w, r)
	if !ok {
		return
	}
	if r.URL.Query().Get("limit") == "" {
		limit = 10
	}
	f, e := a.visitFilter(r)
	if e != nil {
		if errors.Is(e, errShortSearch) {
			failure(w, 400, "SEARCH_TOO_SHORT", "Escribe al menos tres caracteres")
			return
		}
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	from := visitFrom(r.URL.Query(), sort)
	var total int
	args := append([]any{pgx.QueryExecModeExec}, f.args...)
	if e = a.Pool.QueryRow(r.Context(), `SELECT count(*)`+from+f.where(), args...).Scan(&total); e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT v.*`+from+f.where()+fmt.Sprintf(` ORDER BY %s LIMIT $%d OFFSET $%d`, sort.orderBy, len(f.args)+1, len(f.args)+2), append(args, limit, (page-1)*limit)...)
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
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"visits": items, "total": total, "page": page, "limit": limit}, "meta": map[string]int{"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) / limit}})
}

func visitFrom(q url.Values, sort visitSort) string {
	if q.Get("search") == "" && q.Get("company") == "" && sort.field != "company" {
		return ` FROM "Visits" v`
	}
	return ` FROM "Visits" v LEFT JOIN "Visitors" p ON p.id=COALESCE(v.visitor_id,(SELECT legacy.id FROM "Visitors" legacy WHERE legacy.cedula=v.visitor_cedula))`
}

func (a *App) exportVisits(w http.ResponseWriter, r *http.Request) {
	maximum, e := visitExportLimit(r.URL.Query().Get("format"))
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	sort, e := parseVisitSort(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	tx, e := a.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	f, e := a.visitFilterWith(r, tx)
	if e != nil {
		if errors.Is(e, errShortSearch) {
			failure(w, 400, "SEARCH_TOO_SHORT", "Escribe al menos tres caracteres")
		} else {
			failure(w, 400, "VALIDATION_ERROR", e.Error())
		}
		return
	}
	from := visitFrom(r.URL.Query(), sort)
	args := append([]any{pgx.QueryExecModeExec}, f.args...)
	var total int
	if e = tx.QueryRow(r.Context(), `SELECT count(*)`+from+f.where(), args...).Scan(&total); e != nil {
		a.serverError(w, e)
		return
	}
	if total > maximum {
		failure(w, 413, "EXPORT_LIMIT_EXCEEDED", fmt.Sprintf("El formato admite hasta %d visitas; aplica filtros más estrechos", maximum))
		return
	}
	rows, e := tx.Query(r.Context(), `SELECT v.*`+from+f.where()+` ORDER BY `+sort.orderBy, args...)
	if e != nil {
		a.serverError(w, e)
		return
	}
	visits, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visit])
	if e != nil {
		a.serverError(w, e)
		return
	}
	items, e := a.visitDTOsWith(r, visits, tx, a.Queries.WithTx(tx))
	if e != nil {
		a.serverError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]any{"visits": items, "total": total})
}

func (a *App) visitDTOs(r *http.Request, visits []store.Visit) ([]map[string]any, error) {
	return a.visitDTOsWith(r, visits, a.Pool, a.Queries)
}

func (a *App) visitDTOsWith(r *http.Request, visits []store.Visit, query visitQueryer, queries *store.Queries) ([]map[string]any, error) {
	ids := []int32{}
	hashes := []string{}
	for _, v := range visits {
		if v.VisitorID.Valid {
			ids = append(ids, v.VisitorID.Int32)
		} else {
			hashes = append(hashes, v.VisitorCedula)
		}
	}
	rows, e := query.Query(r.Context(), `SELECT `+profileColumns+` FROM "Visitors" WHERE id=ANY($1) OR cedula=ANY($2)`, pgx.QueryExecModeExec, ids, hashes)
	if e != nil {
		return nil, e
	}
	people, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.Visitor])
	if e != nil {
		return nil, e
	}
	byID := map[int32]store.Visitor{}
	byHash := map[string]store.Visitor{}
	for _, p := range people {
		byID[p.ID] = p
		byHash[p.Cedula] = p
	}
	items := []map[string]any{}
	for _, v := range visits {
		p, found := byID[v.VisitorID.Int32]
		if !v.VisitorID.Valid {
			p, found = byHash[v.VisitorCedula]
		}
		dto, e := a.visitDataWith(r, v, p, found, queries)
		if e != nil {
			return nil, e
		}
		items = append(items, dto)
	}
	return items, nil
}
