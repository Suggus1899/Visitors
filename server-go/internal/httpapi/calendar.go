package httpapi

import "net/http"

func (a *App) calendar(w http.ResponseWriter, r *http.Request) {
	start, end, e := dateRange(r.URL.Query())
	if e != nil || start == nil || end == nil || end.Sub(*start).Hours() > 24*62 {
		failure(w, 400, "VALIDATION_ERROR", "Selecciona un rango de hasta 62 días")
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && status != "active" && status != "completed" && status != "waiting" && status != "intermittent" {
		failure(w, 400, "VALIDATION_ERROR", "Estado inválido")
		return
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT (check_in_time AT TIME ZONE 'America/Caracas')::date::text,count(*)::int FROM "Visits" WHERE check_in_time>=$1 AND check_in_time<$2 AND ($3='' OR status::text=$3) GROUP BY 1 ORDER BY 1`, start, end, status)
	if e != nil {
		a.serverError(w, e)
		return
	}
	defer rows.Close()
	days := []map[string]any{}
	for rows.Next() {
		var day string
		var count int
		if e = rows.Scan(&day, &count); e != nil {
			a.serverError(w, e)
			return
		}
		days = append(days, map[string]any{"date": day, "count": count})
	}
	if e = rows.Err(); e != nil {
		a.serverError(w, e)
		return
	}
	success(w, map[string]any{"days": days})
}
