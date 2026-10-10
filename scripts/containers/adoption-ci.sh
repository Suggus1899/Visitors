#!/bin/sh
set -eu
test "${GITHUB_ACTIONS:-false}" = true || { echo 'Disposable CI rehearsal only.' >&2; exit 1; }
compose() { docker compose "$@"; }
stage() { compose run --rm -e DOTENV_CONFIG_PATH=/run/secrets/staging_env ops ops "$@"; }
# Only this runner's separate restore service is reset; the pilot database is untouched.
{ printf 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n'; cat server-go/db/schema.sql; } |
  compose exec -T postgres-restore psql -X -U logmaster_restore_test -d logmaster_restore_test --single-transaction -v ON_ERROR_STOP=1
identifier=$(printf '%s' 'V-66778899' | openssl dgst -sha256 | awk '{print $NF}')
compose exec -T postgres-restore psql -X -U logmaster_restore_test -d logmaster_restore_test -v ON_ERROR_STOP=1 -c "INSERT INTO \"Visitors\"(cedula,encrypted_cedula,first_name,last_name,company,\"createdAt\",\"updatedAt\") VALUES('$identifier','V-66778899','Ficticio','Legado','Laboratorio',now(),now()); INSERT INTO \"Visits\"(visitor_cedula,purpose,person_to_visit,check_in_time,check_out_time,status,\"createdAt\",\"updatedAt\") VALUES('$identifier','Ensayo','Ficticio',now()-interval '1 hour',now(),'completed',now(),now());"
stage preflight
stage adopt
stage adopt --apply --confirm-target postgres-restore:5432/logmaster_restore_test
stage adopt --apply --confirm-target postgres-restore:5432/logmaster_restore_test
stage migrate --apply --confirm-target postgres-restore:5432/logmaster_restore_test
compose -f compose.yaml -f deploy/compose.admin.yaml run --rm -e DOTENV_CONFIG_PATH=/run/secrets/staging_env ops ops bootstrap-root --email root@example.test --password-file /run/secrets/maintenance_password --apply --confirm-target postgres-restore:5432/logmaster_restore_test
compose run --rm -e DOTENV_CONFIG_PATH=/run/secrets/staging_env ops check
preserved=$(compose exec -T postgres-restore psql -U logmaster_restore_test -d logmaster_restore_test -Atc "SELECT count(*) FROM \"Visits\" WHERE visitor_cedula='$identifier' AND status='completed'")
test "$preserved" = 1
