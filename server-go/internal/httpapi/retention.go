package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"
)

func (a *App) Retention(ctx context.Context, now time.Time) (map[string]int64, error) {
	counts := map[string]int64{"logs": 0, "visits": 0, "visitors": 0, "requests": 0}
	if !a.Config.RetentionEnabled {
		return counts, nil
	}
	if a.Config.DataRetentionDays < 1 || a.Config.AuditRetentionDays < 1 {
		return nil, errors.New("invalid retention configuration")
	}
	tx, e := a.Pool.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	var locked bool
	if e = tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(584038172)`).Scan(&locked); e != nil {
		return nil, e
	}
	if !locked {
		return counts, nil
	}
	cutoff := now.In(caracas).AddDate(0, 0, -a.Config.DataRetentionDays)
	auditCutoff := now.In(caracas).AddDate(0, 0, -a.Config.AuditRetentionDays)
	for _, operation := range []struct {
		key, sql string
		cutoff   time.Time
	}{
		{"logs", `DELETE FROM "ActivityLogs" WHERE "createdAt"<$1`, auditCutoff},
		{"visits", `DELETE FROM "Visits" WHERE status='completed' AND check_out_time<$1 AND "updatedAt"<$1`, cutoff},
		{"requests", `DELETE FROM "ArcoRequests" WHERE status IN ('completed','rejected') AND GREATEST("createdAt","updatedAt")<$1`, cutoff},
		{"visitors", `DELETE FROM "Visitors" p WHERE GREATEST(p."createdAt",p."updatedAt")<$1 AND NOT EXISTS(SELECT 1 FROM "Visits" v WHERE v.visitor_id=p.id OR v.visitor_cedula=p.cedula) AND NOT EXISTS(SELECT 1 FROM "ArcoRequests" a WHERE a."subjectCedulaHash"=p.cedula AND a.status IN ('pending','in_progress'))`, cutoff},
	} {
		result, e := tx.Exec(ctx, operation.sql, operation.cutoff)
		if e != nil {
			return nil, e
		}
		counts[operation.key] = result.RowsAffected()
	}
	details, e := json.Marshal(counts)
	if e != nil {
		return nil, e
	}
	result, e := tx.Exec(ctx, `INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",details,"createdAt",role,status) SELECT id,username,'RETENTION_CLEANUP','System','retention',$1,now(),'root','success' FROM "Users" WHERE role='root' ORDER BY id LIMIT 1`, string(details))
	if e != nil {
		return nil, e
	}
	if result.RowsAffected() != 1 {
		return nil, errors.New("root account required to audit retention")
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return counts, nil
}
func (a *App) ScheduleRetention(ctx context.Context) {
	if !a.Config.RetentionEnabled {
		return
	}
	for {
		now := time.Now().In(caracas)
		next := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, caracas)
		if !next.After(now) {
			next = next.AddDate(0, 0, 1)
		}
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			operation, cancel := context.WithTimeout(ctx, 5*time.Minute)
			counts, e := a.Retention(operation, time.Now())
			cancel()
			if e != nil {
				slog.Error("retention failed")
			} else {
				slog.Info("retention completed", "counts", counts)
			}
		}
	}
}
