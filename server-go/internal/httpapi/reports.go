package httpapi

import (
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"
)

var dayNames = []string{"Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"}
var monthNames = []string{"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"}

type reportVisit struct {
	Count         int     `db:"count"`
	Minutes       float64 `db:"minutes"`
	VisitorCedula string  `db:"visitor_cedula"`
	Purpose       string
	CheckInTime   pgtype.Timestamptz `db:"check_in_time"`
	CheckOutTime  pgtype.Timestamptz `db:"check_out_time"`
	Status        string
}

func (a *App) reportVisits(r *http.Request, start, end time.Time) ([]reportVisit, error) {
	rows, e := a.Pool.Query(r.Context(), `SELECT ''::text AS visitor_cedula,purpose,min(check_in_time) AS check_in_time,NULL::timestamptz AS check_out_time,status::text,count(*)::int AS count,COALESCE(sum(EXTRACT(epoch FROM(check_out_time-check_in_time))/60) FILTER(WHERE status='completed'),0)::float8 AS minutes FROM "Visits" WHERE check_in_time>=$1 AND check_in_time<$2 GROUP BY (check_in_time AT TIME ZONE 'America/Caracas')::date,purpose,status ORDER BY min(check_in_time)`, start, end)
	if e != nil {
		return nil, e
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[reportVisit])
}
func monthRange(q url.Values) (time.Time, time.Time, error) {
	now := time.Now().In(caracas)
	month, year := int(now.Month())-1, now.Year()
	var e error
	if v := q.Get("month"); v != "" {
		month, e = strconv.Atoi(v)
		if e != nil || month < 0 || month > 11 {
			return time.Time{}, time.Time{}, fmt.Errorf("mes inválido (0–11)")
		}
	}
	if v := q.Get("year"); v != "" {
		year, e = strconv.Atoi(v)
		if e != nil || year < 1900 || year > 9998 {
			return time.Time{}, time.Time{}, fmt.Errorf("año inválido")
		}
	}
	start := time.Date(year, time.Month(month+1), 1, 0, 0, 0, 0, caracas)
	return start, start.AddDate(0, 1, 0), nil
}
func reasonGroups(counts map[string]int, total, limit int) []map[string]any {
	keys := []string{}
	for reason := range counts {
		keys = append(keys, reason)
	}
	sort.Slice(keys, func(i, j int) bool {
		if counts[keys[i]] == counts[keys[j]] {
			return keys[i] < keys[j]
		}
		return counts[keys[i]] > counts[keys[j]]
	})
	if limit > 0 && len(keys) > limit {
		keys = keys[:limit]
	}
	items := []map[string]any{}
	for _, reason := range keys {
		item := map[string]any{"purpose": reason, "count": counts[reason]}
		if total > 0 {
			item["percentage"] = math.Round(float64(counts[reason]) * 100 / float64(total))
		}
		items = append(items, item)
	}
	return items
}
func aggregateReport(visits []reportVisit, start, end time.Time, monthly bool) map[string]any {
	completed, active := 0, 0
	minutes := float64(0)
	unique := map[string]bool{}
	reasons := map[string]int{}
	days := map[string]int{}
	weeks := map[string]int{}
	weekReasons := map[string]map[string]int{}
	dayReasons := make([]map[string]int, 7)
	dayCounts := make([]int, 7)
	for i := range dayReasons {
		dayReasons[i] = map[string]int{}
	}
	for _, v := range visits {
		count := v.Count
		if count == 0 {
			count = 1
		}
		if v.Status == "completed" {
			completed += count
			minutes += v.Minutes
			if v.CheckInTime.Valid && v.CheckOutTime.Valid {
				minutes += v.CheckOutTime.Time.Sub(v.CheckInTime.Time).Minutes()
			}
		}
		if v.Status == "active" {
			active += count
		}
		unique[v.VisitorCedula] = true
		purpose := v.Purpose
		if purpose == "" {
			purpose = "Sin especificar"
		}
		reasons[purpose] += count
		d := v.CheckInTime.Time.In(caracas)
		weekday := int(d.Weekday())
		dayCounts[weekday] += count
		dayReasons[weekday][purpose] += count
		days[d.Format("2006-01-02")] += count
		weekStart := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, caracas).AddDate(0, 0, -weekday)
		week := weekStart.Format("2006-01-02")
		if !monthly {
			week = weekStart.UTC().Format(time.RFC3339)
		}
		weeks[week] += count
		if weekReasons[week] == nil {
			weekReasons[week] = map[string]int{}
		}
		weekReasons[week][purpose] += count
	}
	weekdays := []map[string]any{}
	for i, count := range dayCounts {
		item := map[string]any{"dayName": dayNames[i], "count": count}
		if monthly {
			item["day"] = i
			item["topReasons"] = reasonGroups(dayReasons[i], 0, 3)
		}
		weekdays = append(weekdays, item)
	}
	weekKeys := []string{}
	for key := range weeks {
		weekKeys = append(weekKeys, key)
	}
	sort.Strings(weekKeys)
	byWeek := []map[string]any{}
	for _, key := range weekKeys {
		item := map[string]any{"weekStart": key, "count": weeks[key]}
		if monthly {
			item["topReasons"] = reasonGroups(weekReasons[key], 0, 3)
		}
		byWeek = append(byWeek, item)
	}
	dailyKeys := []string{}
	for key := range days {
		dailyKeys = append(dailyKeys, key)
	}
	sort.Strings(dailyKeys)
	daily := []map[string]any{}
	for _, key := range dailyKeys {
		daily = append(daily, map[string]any{"date": key, "count": days[key]})
	}
	n := reportCount(visits)
	divisor := math.Max(1, math.Ceil(end.Sub(start).Hours()/24))
	summary := map[string]any{"totalVisits": n, "completedVisits": completed, "activeVisits": active, "avgVisitsPerDay": math.Round(float64(n)/divisor*10) / 10}
	period := map[string]any{"start": start.UTC().Format(time.RFC3339Nano), "end": end.UTC().Format(time.RFC3339Nano)}
	if monthly {
		period = map[string]any{"month": int(start.Month()) - 1, "monthName": monthNames[int(start.Month())-1], "year": start.Year()}
		duration, rate := float64(0), float64(0)
		if completed > 0 {
			duration = math.Round(minutes / float64(completed))
		}
		if n > 0 {
			rate = math.Round(float64(completed) * 100 / float64(n))
		}
		summary["uniqueVisitors"] = len(unique)
		summary["averageDuration"] = duration
		summary["completionRate"] = rate
	}
	result := map[string]any{"period": period, "summary": summary, "byReason": reasonGroups(reasons, n, 0), "byDayOfWeek": weekdays, "byWeek": byWeek}
	if !monthly {
		result["recentActivity"] = daily
		result["byStatus"] = map[string]int{"active": active, "completed": completed}
	}
	return result
}
func (a *App) mountReports(router chi.Router) {
	router.Group(func(r chi.Router) {
		r.Use(a.authenticate)
		r.Get("/api/v1/reports/stats", a.visitStats)
		r.Get("/api/v1/reports/stats/monthly", a.monthlyReport)
		r.Get("/api/v1/reports/comparison", a.comparison)
		r.Get("/api/v1/reports/alerts", a.alerts)
	})
}
func (a *App) visitStats(w http.ResponseWriter, r *http.Request) {
	start, end, e := dateRange(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	now := time.Now().In(caracas)
	if end == nil {
		end = &now
	}
	if start == nil {
		v := end.AddDate(0, 0, -30)
		start = &v
	}
	if !start.Before(*end) {
		failure(w, 400, "VALIDATION_ERROR", "Rango inválido")
		return
	}
	visits, e := a.reportVisits(r, *start, *end)
	if e != nil {
		a.serverError(w, e)
		return
	}
	result := aggregateReport(visits, *start, *end, false)
	var active int
	if e = a.Pool.QueryRow(r.Context(), `SELECT count(*) FROM "Visits" WHERE status='active' AND check_out_time IS NULL`).Scan(&active); e != nil {
		a.serverError(w, e)
		return
	}
	result["summary"].(map[string]any)["activeVisits"] = active
	result["byStatus"].(map[string]int)["active"] = active
	success(w, result)
}
func (a *App) monthlyReport(w http.ResponseWriter, r *http.Request) {
	start, end, e := monthRange(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	visits, e := a.reportVisits(r, start, end)
	if e != nil {
		a.serverError(w, e)
		return
	}
	result := aggregateReport(visits, start, end, true)
	var unique int
	if e = a.Pool.QueryRow(r.Context(), `SELECT count(DISTINCT visitor_cedula) FROM "Visits" WHERE check_in_time>=$1 AND check_in_time<$2`, start, end).Scan(&unique); e != nil {
		a.serverError(w, e)
		return
	}
	result["summary"].(map[string]any)["uniqueVisitors"] = unique
	success(w, result)
}
func (a *App) comparison(w http.ResponseWriter, r *http.Request) {
	start, end, e := monthRange(r.URL.Query())
	if e != nil {
		failure(w, 400, "VALIDATION_ERROR", e.Error())
		return
	}
	current, e := a.reportVisits(r, start, end)
	if e != nil {
		a.serverError(w, e)
		return
	}
	last, e := a.reportVisits(r, start.AddDate(0, -1, 0), start)
	if e != nil {
		a.serverError(w, e)
		return
	}
	growth := float64(0)
	if reportCount(last) > 0 {
		growth = float64(reportCount(current)-reportCount(last)) * 100 / float64(reportCount(last))
	} else if reportCount(current) > 0 {
		growth = 100
	}
	reasons := map[string]any{}
	for key, visits := range map[string][]reportVisit{"current": current, "last": last} {
		counts := map[string]int{}
		for _, v := range visits {
			count := v.Count
			if count == 0 {
				count = 1
			}
			counts[v.Purpose] += count
		}
		reasons[key] = reasonGroups(counts, 0, 0)
	}
	success(w, map[string]any{"summary": map[string]any{"currentMonth": reportCount(current), "lastMonth": reportCount(last), "growth": growth}, "reasons": reasons})
}

func reportCount(visits []reportVisit) int {
	count := 0
	for _, visit := range visits {
		if visit.Count == 0 {
			count++
		} else {
			count += visit.Count
		}
	}
	return count
}
func (a *App) alerts(w http.ResponseWriter, r *http.Request) {
	threshold := 8
	if raw := r.URL.Query().Get("threshold"); raw != "" {
		n, e := strconv.Atoi(raw)
		if e != nil || n < 1 || n > 87600 {
			failure(w, 400, "VALIDATION_ERROR", "Umbral inválido")
			return
		}
		threshold = n
	}
	rows, e := a.Pool.Query(r.Context(), `SELECT * FROM "Visits" WHERE status='active' AND check_out_time IS NULL AND check_in_time<$1 ORDER BY check_in_time`, time.Now().Add(-time.Duration(threshold)*time.Hour))
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
	counts := map[string]int{}
	for _, v := range visits {
		counts[v.CheckInTime.Time.In(caracas).Format("2006-01-02")]++
	}
	keys := []string{}
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	dates := []map[string]any{}
	for _, key := range keys {
		dates = append(dates, map[string]any{"date": key, "count": counts[key]})
	}
	success(w, map[string]any{"total": len(visits), "byDate": dates, "visits": items})
}
