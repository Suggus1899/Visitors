#!/bin/sh
set -eu
compose() { docker compose --profile test "$@"; }
compose config --quiet
compose build
compose up -d --wait postgres mailpit
compose run --rm ops migrate
compose run --rm ops seed
compose up -d --wait api web
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
systemd-analyze calendar '*-*-* 01:00:00 America/Caracas'
systemd-analyze calendar 'Sun *-*-* 03:00:00 America/Caracas'
systemd-analyze verify deploy/systemd/*.service deploy/systemd/*.timer
