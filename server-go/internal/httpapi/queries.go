package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	index "github.com/Suggus1899/Visitors/server-go/internal/search"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/jackc/pgx/v5"
	"net/http"
	"strings"
)

const profileColumns = `id,"anonymizedAt",cedula,encrypted_cedula,first_name,last_name,company,job_title,photo_url,id_photo_url,email,phone,"updatedAt",NULL::bytea AS photo_data,NULL::bytea AS id_photo_data,"isBlocked",observations,"createdAt"`

// Encrypted names are searched by streaming profiles, without loading photographs.
func (a *App) matchingVisitors(r *http.Request, search string) ([]int32, error) {
	if e := validateSearch(search); e != nil {
		return nil, e
	}
	tokens := index.Tokens(a.Config.EncryptionKey, search)
	rows, e := a.Pool.Query(r.Context(), `SELECT p.id,p.first_name,p.last_name,p.encrypted_cedula FROM "Visitors" p JOIN (SELECT visitor_id FROM "VisitorSearchTokens" WHERE token=ANY($1::bytea[]) GROUP BY visitor_id HAVING count(*)=$2) matches ON matches.visitor_id=p.id WHERE p."anonymizedAt" IS NULL`, tokens, len(tokens))
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
		if status != "active" && status != "waiting" && status != "intermittent" && status != "completed" {
			return f, fmt.Errorf("estado inválido")
		}
		f.add("v.status::text=?", status)
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
		f.add("v.visitor_cedula=?", security.Hash(value))
	}
	if search := q.Get("search"); search != "" {
		if len(search) > 500 {
			return f, fmt.Errorf("búsqueda demasiado larga")
		}
		ids, e := a.matchingVisitors(r, search)
		if e != nil {
			return f, e
		}
		f.add(`(v.purpose ILIKE '%'||?||'%' OR v.person_to_visit ILIKE '%'||?||'%' OR v.notes ILIKE '%'||?||'%' OR v.host_person ILIKE '%'||?||'%' OR v.target_department ILIKE '%'||?||'%' OR p.company ILIKE '%'||?||'%' OR p.id=ANY(`+fmt.Sprintf("$%d", len(f.args)+2)+`))`, search)
		f.args = append(f.args, ids)
	}
	return f, nil
}
func (a *App) filteredVisits(w http.ResponseWriter, r *http.Request) {
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
	from := ` FROM "Visits" v LEFT JOIN "Visitors" p ON p.id=COALESCE(v.visitor_id,(SELECT legacy.id FROM "Visitors" legacy WHERE legacy.cedula=v.visitor_cedula))`
	var total int
	if e = a.Pool.QueryRow(r.Context(), `SELECT count(*)`+from+f.where(), f.args...).Scan(&total); e != nil {
		a.serverError(w, e)
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT v.*`+from+f.where()+fmt.Sprintf(` ORDER BY v.check_in_time DESC,v.id DESC LIMIT $%d OFFSET $%d`, len(f.args)+1, len(f.args)+2), append(f.args, limit, (page-1)*limit)...)
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
func (a *App) visitDTOs(r *http.Request, visits []store.Visit) ([]map[string]any, error) {
	ids := []int32{}
	hashes := []string{}
	for _, v := range visits {
		if v.VisitorID.Valid {
			ids = append(ids, v.VisitorID.Int32)
		} else {
			hashes = append(hashes, v.VisitorCedula)
		}
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT `+profileColumns+` FROM "Visitors" WHERE id=ANY($1) OR cedula=ANY($2)`, ids, hashes)
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
		dto, e := a.visitData(r, v, p, found)
		if e != nil {
			return nil, e
		}
		items = append(items, dto)
	}
	return items, nil
}
