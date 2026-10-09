package httpapi

import (
	"context"
	"fmt"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"os"
)

func (a *App) Seed(ctx context.Context) error {
	if !a.Config.LocalDevelopment() {
		return fmt.Errorf("seeding restricted to isolated local databases")
	}
	tx, e := a.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	for _, account := range []struct{ name, role, env string }{{"root", "root", "SEED_ROOT_PASSWORD"}, {"Admin", "admin", "SEED_ADMIN_PASSWORD"}, {"admin", "admin", "SEED_ADMIN_PASSWORD"}, {"operador", "operador", "SEED_OPERADOR_PASSWORD"}, {"guard", "operador", "SEED_GUARD_PASSWORD"}, {"auditor", "auditor", "SEED_AUDITOR_PASSWORD"}, {"demo", "demo", "SEED_DEMO_PASSWORD"}} {
		var exists bool
		if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Users" WHERE username=$1)`, account.name).Scan(&exists); e != nil {
			return e
		}
		if exists {
			continue
		}
		password := os.Getenv(account.env)
		if e = security.ValidatePassword(password); e != nil {
			return fmt.Errorf("%s: %w", account.env, e)
		}
		hash, e := security.PasswordHash(password)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO "Users"(username,password,role,email,"mustChangePassword","createdAt","updatedAt") VALUES($1,$2,$3,$4,true,now(),now()) ON CONFLICT(username) DO NOTHING`, account.name, hash, account.role, account.name+"@example.test"); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
