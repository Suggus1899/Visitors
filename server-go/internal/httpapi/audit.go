package httpapi

import (
	"encoding/csv"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode"
)

var caracas = func() *time.Location {
	location, e := time.LoadLocation("America/Caracas")
	if e != nil {
		panic(e)
	}
	return location
}()

// SQL ranges are half-open; date-only filters always refer to Caracas.
func dateRange(q url.Values) (*time.Time, *time.Time, error) {
	var start, end *time.Time
	for _, field := range []struct {
		key    string
		target **time.Time
		end    bool
	}{{"startDate", &start, false}, {"endDate", &end, true}} {
		raw := q.Get(field.key)
		if raw == "" {
			continue
		}
		value, e := time.ParseInLocation("2006-01-02", raw, caracas)
		if e == nil {
			if field.end {
				value = value.AddDate(0, 0, 1)
			}
		} else {
			value, e = time.Parse(time.RFC3339Nano, raw)
			if e != nil {
				return nil, nil, fmt.Errorf("fecha inválida: %s", field.key)
			}
			if field.end {
				value = value.Add(time.Nanosecond)
			}
		}
		*field.target = &value
	}
	if start != nil && end != nil && !start.Before(*end) {
		return nil, nil, fmt.Errorf("rango de fechas inválido")
	}
	return start, end, nil
}

type sqlFilter struct {
	conditions []string
	args       []any
}

func (f *sqlFilter) add(expression string, value any) {
	f.args = append(f.args, value)
	f.conditions = append(f.conditions, strings.ReplaceAll(expression, "?", fmt.Sprintf("$%d", len(f.args))))
}
func (f sqlFilter) where() string {
	if len(f.conditions) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(f.conditions, " AND ")
}
func auditFilter(q url.Values) (sqlFilter, error) {
	f := sqlFilter{}
	start, end, e := dateRange(q)
	if e != nil {
		return f, e
	}
	if start != nil {
		f.add(`"createdAt">=?`, *start)
	}
	if end != nil {
		f.add(`"createdAt"<?`, *end)
	}
	for _, item := range []struct{ key, column string }{{"action", "action"}, {"username", "username"}, {"entity", "entity"}, {"ip", "\"ipAddress\""}} {
		if v := q.Get(item.key); v != "" {
			if len(v) > 500 {
				return f, fmt.Errorf("filtro demasiado largo")
			}
			f.add(item.column+"=?", v)
		}
	}
	if s := q.Get("search"); s != "" {
		if len(s) > 500 {
			return f, fmt.Errorf("búsqueda demasiado larga")
		}
		f.add(`(username ILIKE '%'||?||'%' OR action ILIKE '%'||?||'%' OR details ILIKE '%'||?||'%' OR "entityId" ILIKE '%'||?||'%')`, s)
	}
	if v := q.Get("userId"); v != "" {
		id, e := strconv.ParseInt(v, 10, 32)
		if e != nil || id < 1 {
			return f, fmt.Errorf("usuario inválido")
		}
		f.add(`"userId"=?`, int32(id))
	}
	return f, nil
}
func (a *App) mountAudit(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate, roles("root", "admin", "auditor"))
		r.Get("/api/v1/audit/logs", a.auditLogs)
		r.Get("/api/v1/audit/stats", a.auditStats)
		r.Get("/api/v1/audit/export", a.auditCSV)
		r.Get("/api/v1/audit/actions", func(w http.ResponseWriter, r *http.Request) { a.auditDistinct(w, r, "action") })
		r.Get("/api/v1/audit/users", func(w http.ResponseWriter, r *http.Request) { a.auditDistinct(w, r, "username") })
		r.Get("/api/v1/audit/config", func(w http.ResponseWriter, r *http.Request) {
			days := a.Config.AuditRetentionDays
			success(w, map[string]any{"retentionDays": days, "enabled": a.Config.RetentionEnabled, "policy": fmt.Sprintf("Retención configurada: %d días. La ejecución requiere habilitación explícita.", days)})
		})
	})
	router.With(a.authenticate, roles("root")).Get("/api/v1/superadmin/audit-logs", a.auditLogs)
}
func (a *App) auditLogs(w http.ResponseWriter, r *http.Request) {
	page, limit, ok := pagination(w, r)
	if !ok {
		return
	}
	offset := (page - 1) * limit
	root := strings.HasPrefix(r.URL.Path, "/api/v1/superadmin/")
	if root {
		if r.URL.Query().Get("limit") == "" {
			limit = 100
		}
		if raw := r.URL.Query().Get("offset"); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil || n < 0 || n > 100000000 {
				failure(w, 400, "VALIDATION_ERROR", "Desplazamiento inválido")
				return
			}
			offset = n
		}
	}
	f, e := auditFilter(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	var total int
	if e = a.Pool.QueryRow(r.Context(), `SELECT count(*) FROM "ActivityLogs"`+f.where(), f.args...).Scan(&total); e != nil {
		a.serverError(w, e)
		return
	}
	sql := `SELECT * FROM "ActivityLogs"` + f.where() + fmt.Sprintf(` ORDER BY "createdAt" DESC,id DESC LIMIT $%d OFFSET $%d`, len(f.args)+1, len(f.args)+2)
	rows, e := a.Pool.Query(r.Context(), sql, append(f.args, limit, offset)...)
	if e != nil {
		a.serverError(w, e)
		return
	}
	logs, e := pgx.CollectRows(rows, pgx.RowToStructByName[store.ActivityLog])
	if e != nil {
		a.serverError(w, e)
		return
	}
	if logs == nil {
		logs = []store.ActivityLog{}
	}
	if root {
		success(w, map[string]any{"logs": logs, "total": total, "limit": limit, "offset": offset})
		return
	}
	success(w, map[string]any{"logs": logs, "pagination": map[string]int{"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) / limit}})
}
func csvText(value string) string {
	leading := strings.TrimLeftFunc(value, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || r == '\ufeff' })
	if leading != "" && strings.ContainsRune("=+-@", []rune(leading)[0]) {
		return "'" + value
	}
	return value
}
func (a *App) auditCSV(w http.ResponseWriter, r *http.Request) {
	f, e := auditFilter(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT * FROM "ActivityLogs"`+f.where()+` ORDER BY "createdAt" DESC,id DESC`, f.args...)
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer rows.Close()
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="auditoria.csv"`)
	w.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(w)
	writer.Write([]string{"ID", "Fecha", "Usuario", "Acción", "Entidad", "ID Entidad", "Detalles", "IP", "User Agent"})
	for rows.Next() {
		v, e := pgx.RowToStructByName[store.ActivityLog](rows)
		if e != nil {
			panic(http.ErrAbortHandler)
		}
		record := []string{fmt.Sprint(v.ID), v.CreatedAt.Time.In(caracas).Format(time.RFC3339), v.Username, v.Action, v.Entity, v.EntityId, v.Details.String, v.IpAddress.String, v.UserAgent.String}
		for i := range record {
			record[i] = csvText(record[i])
		}
		if writer.Write(record) != nil {
			panic(http.ErrAbortHandler)
		}
		writer.Flush()
		if writer.Error() != nil {
			panic(http.ErrAbortHandler)
		}
	}
	writer.Flush()
	if rows.Err() != nil || writer.Error() != nil {
		panic(http.ErrAbortHandler)
	}
}
func (a *App) auditDistinct(w http.ResponseWriter, r *http.Request, column string) {
	rows, e := a.Pool.Query(r.Context(), `SELECT DISTINCT `+pgx.Identifier{column}.Sanitize()+` FROM "ActivityLogs" ORDER BY 1`)
	if e != nil {
		a.serverError(w, e)
		return
	}
	values, e := pgx.CollectRows(rows, pgx.RowTo[string])
	if e != nil {
		a.serverError(w, e)
		return
	}
	if values == nil {
		values = []string{}
	}
	success(w, values)
}
func (a *App) auditStats(w http.ResponseWriter, r *http.Request) {
	now := time.Now().In(caracas)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, caracas)
	week := today.AddDate(0, 0, -7)
	var logins, actions, users, ips int
	e := a.Pool.QueryRow(r.Context(), `SELECT count(*) FILTER(WHERE action='LOGIN'),count(*),count(DISTINCT "userId"),count(DISTINCT "ipAddress") FROM "ActivityLogs" WHERE "createdAt">=$1 AND "createdAt"<$2`, today, today.AddDate(0, 0, 1)).Scan(&logins, &actions, &users, &ips)
	if e != nil {
		a.serverError(w, e)
		return
	}
	last := map[string]any{}
	for _, report := range []struct{ key, label, query string }{{"actionsByType", "action", `SELECT action,count(*) FROM "ActivityLogs" WHERE "createdAt">=$1 GROUP BY action ORDER BY count(*) DESC`}, {"topUsers", "username", `SELECT username,count(*) FROM "ActivityLogs" WHERE "createdAt">=$1 GROUP BY username ORDER BY count(*) DESC LIMIT 5`}, {"dailyActivity", "date", `SELECT to_char("createdAt" AT TIME ZONE 'America/Caracas','YYYY-MM-DD'),count(*) FROM "ActivityLogs" WHERE "createdAt">=$1 GROUP BY 1 ORDER BY 1`}} {
		rows, e := a.Pool.Query(r.Context(), report.query, week)
		if e != nil {
			a.serverError(w, e)
			return
		}
		items, e := pgx.CollectRows(rows, func(row pgx.CollectableRow) (map[string]any, error) {
			var label string
			var n int
			e := row.Scan(&label, &n)
			return map[string]any{report.label: label, "count": n}, e
		})
		if e != nil {
			a.serverError(w, e)
			return
		}
		if items == nil {
			items = []map[string]any{}
		}
		last[report.key] = items
	}
	success(w, map[string]any{"today": map[string]int{"logins": logins, "actions": actions, "uniqueUsers": users, "uniqueIPs": ips}, "lastWeek": last})
}
