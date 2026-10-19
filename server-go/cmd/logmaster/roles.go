package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
)

var rolePasswordPattern = regexp.MustCompile(`^[0-9a-f]{48}$`)

func provisionRoles(ctx context.Context, database *sql.DB, databaseName, runtimePassword, backupPassword string) error {
	if !rolePasswordPattern.MatchString(runtimePassword) || !rolePasswordPattern.MatchString(backupPassword) {
		return errors.New("runtime and backup database passwords must be 48 lowercase hexadecimal characters")
	}
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var owner string
	var superuser bool
	if err = tx.QueryRowContext(ctx, `SELECT current_user, rolsuper FROM pg_roles WHERE rolname=current_user`).Scan(&owner, &superuser); err != nil {
		return err
	}
	if !superuser {
		return errors.New("role provisioning requires the maintenance superuser")
	}
	for _, role := range []struct{ name, password string }{
		{"logmaster_runtime", runtimePassword}, {"logmaster_backup", backupPassword},
	} {
		var exists bool
		if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1)`, role.name).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			if _, err = tx.ExecContext(ctx, `CREATE ROLE `+role.name+` LOGIN`); err != nil {
				return err
			}
		}
		var member bool
		if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1)`, role.name).Scan(&member); err != nil {
			return err
		}
		if member {
			return errors.New("database role has unexpected inherited memberships")
		}
		if _, err = tx.ExecContext(ctx, fmt.Sprintf(`ALTER ROLE %s WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s'`, role.name, role.password)); err != nil {
			return err
		}
	}
	statements := []string{
		`GRANT CONNECT ON DATABASE ` + pgx.Identifier{databaseName}.Sanitize() + ` TO logmaster_runtime, logmaster_backup`,
		`GRANT USAGE ON SCHEMA public TO logmaster_runtime, logmaster_backup`,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO logmaster_runtime`,
		`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_runtime`,
		`GRANT SELECT ON ALL TABLES IN SCHEMA public TO logmaster_backup`,
		`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_backup`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE ` + pgx.Identifier{owner}.Sanitize() + ` IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logmaster_runtime`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE ` + pgx.Identifier{owner}.Sanitize() + ` IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO logmaster_runtime`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE ` + pgx.Identifier{owner}.Sanitize() + ` IN SCHEMA public GRANT SELECT ON TABLES TO logmaster_backup`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE ` + pgx.Identifier{owner}.Sanitize() + ` IN SCHEMA public GRANT SELECT ON SEQUENCES TO logmaster_backup`,
	}
	for _, statement := range statements {
		if _, err = tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return tx.Commit()
}
