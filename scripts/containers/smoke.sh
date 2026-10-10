#!/bin/sh
set -eu
compose() { docker compose --profile test "$@"; }
compose config --quiet
compose build
compose up -d --wait postgres mailpit
compose run --rm ops migrate
compose run --rm ops seed
compose up -d --wait api web
api_container=$(compose ps -q api)
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}}{{end}}{{end}}' "$api_container")" = tmpfs
curl --fail --silent --show-error --retry 5 --retry-all-errors --cacert .local/containers/tls.pem https://localhost:8443/api/v1/health
before=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT count(*) FROM "Users"')
compose up -d --force-recreate --wait postgres api web
after=$(compose exec -T postgres psql -U logmaster_pilot -d logmaster_pilot -Atc 'SELECT count(*) FROM "Users"')
test "$before" = "$after"
test "$after" -ge 1
curl --fail --silent --show-error --retry 5 --retry-all-errors --cacert .local/containers/tls.pem https://localhost:8443/api/v1/health
echo 'Container recreation preserved the fictitious database.'
compose up -d --wait postgres-restore
compose run --rm ops backup-daily
compose run --rm ops rehearse
compose run --rm ops backup-status
compose stop web api
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
compose up -d --wait api web
systemd-analyze calendar '*-*-* 01:00:00 America/Caracas'
systemd-analyze calendar 'Sun *-*-* 03:00:00 America/Caracas'
systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer
