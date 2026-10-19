#!/bin/sh
set -eu
compose() { docker compose --profile test "$@"; }
compose config --quiet
compose build
compose up -d --wait postgres mailpit
compose run --rm ops migrate
docker compose -f compose.yaml -f deploy/compose.admin.yaml --profile test run --rm ops ops roles --runtime-password-file /run/secrets/runtime_db_password --backup-password-file /run/secrets/backup_db_password --apply --confirm-target postgres:5432/logmaster_pilot
compose run --rm ops seed
roles=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc "SELECT count(*) FROM pg_roles WHERE rolname IN ('logmaster_runtime','logmaster_backup') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole")
test "$roles" = 2
compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U logmaster_pilot -d logmaster_pilot -c 'SET ROLE logmaster_runtime; SELECT count(*) FROM "Users"' >/dev/null
if compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U logmaster_pilot -d logmaster_pilot -c 'SET ROLE logmaster_backup; UPDATE "Users" SET username=username WHERE false' >/dev/null 2>&1; then
  echo 'Backup account unexpectedly has write privileges.' >&2
  exit 1
fi
compose up -d --wait api web
test "$(compose exec -T api awk '$2 == "/var/lib/postgresql/data" { print $3 }' /proc/mounts)" = tmpfs
if compose exec -T api awk '$2 == "/var/lib/logmaster/passwords" { found=1 } END { exit !found }' /proc/mounts; then
  echo 'API unexpectedly has the private password volume.' >&2
  exit 1
fi
curl --fail --silent --show-error --retry 5 --retry-all-errors --cacert .local/containers/tls.pem https://localhost:8443/api/v1/health
visitor_probe='V-12345678'
token_probe='reset_token_probe_36f1249d'
probe_status=$(curl --silent --show-error --cacert .local/containers/tls.pem --output /dev/null --write-out '%{http_code}' "https://localhost:8443/api/v1/visitors/$visitor_probe/photo?token=$token_probe")
test "$probe_status" = 401
proxy_logs=$(compose logs --no-color --since=30s web)
for sensitive_value in "$visitor_probe" "$token_probe"; do
  if printf '%s' "$proxy_logs" | grep -Fq "$sensitive_value"; then
    echo 'Proxy logs exposed a visitor identifier or query token.' >&2
    exit 1
  fi
done
printf '%s' "$proxy_logs" | grep -Eq 'request_id=[[:xdigit:]]{32}'
before=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT count(*) FROM "Users"')
compose up -d --force-recreate --wait postgres api frontend web
after=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT count(*) FROM "Users"')
test "$before" = "$after"
test "$after" -ge 1
curl --fail --silent --show-error --retry 5 --retry-all-errors --cacert .local/containers/tls.pem https://localhost:8443/api/v1/health
echo 'Container recreation preserved the fictitious database.'
compose up -d --wait postgres-restore
compose run --rm backup backup-daily
compose run --rm ops rehearse
compose run --rm ops backup-status
compose stop web frontend api
version_before=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT max("tokenVersion") FROM "Users"')
archive=$(compose run --rm ops backup-status | python3 -c 'import json,sys; print(json.load(sys.stdin)["backup"]["archive"])')
compose run --rm ops ops preflight
compose run --rm ops ops restore --archive "$archive" --staging-env /run/secrets/staging_env
version_dry=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT max("tokenVersion") FROM "Users"')
test "$version_before" = "$version_dry"
if compose run --rm ops ops restore --archive "$archive" --root nonexistent --staging-env /run/secrets/staging_env --apply --confirm-target postgres:5432/logmaster_pilot; then
  echo 'Restoration with absent root unexpectedly succeeded.' >&2
  exit 1
fi
compose run --rm ops ops restore --archive "$archive" --staging-env /run/secrets/staging_env --apply --confirm-target postgres:5432/logmaster_pilot
compose run --rm ops ops migrate --apply --confirm-target postgres:5432/logmaster_pilot
compose run --rm ops ops migrate --apply --confirm-target postgres:5432/logmaster_pilot
version_after=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT max("tokenVersion") FROM "Users"')
if ! test "$version_after" -gt "$version_before"; then
  printf 'Session revocation assertion failed: before=%s after=%s\n' "$version_before" "$version_after" >&2
  exit 1
fi
compose run --rm ops check
compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U logmaster_pilot -d logmaster_pilot -c 'SET ROLE logmaster_runtime; SELECT count(*) FROM "Users"' >/dev/null
compose up -d --wait api frontend web
systemd-analyze calendar '*-*-* 01:00:00 America/Caracas'
systemd-analyze calendar 'Sun *-*-* 03:00:00 America/Caracas'
systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer
