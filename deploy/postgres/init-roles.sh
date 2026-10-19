#!/bin/sh
set -eu

runtime_password=$(cat /run/secrets/runtime_db_password)
backup_password=$(cat /run/secrets/backup_db_password)
if [ "${#runtime_password}" -ne 48 ] || [ "${#backup_password}" -ne 48 ]; then
  echo 'Database role passwords must be 48 hexadecimal characters.' >&2
  exit 1
fi
case "$runtime_password$backup_password" in
  *[!0-9a-f]*) echo 'Database role passwords must be lowercase hexadecimal.' >&2; exit 1;;
esac

{
printf '\\set runtime_password %s\n\\set backup_password %s\n' "$runtime_password" "$backup_password"
cat <<'SQL'
CREATE ROLE logmaster_runtime LOGIN PASSWORD :'runtime_password';
CREATE ROLE logmaster_backup LOGIN PASSWORD :'backup_password';
GRANT CONNECT ON DATABASE :"database" TO logmaster_runtime, logmaster_backup;
GRANT USAGE ON SCHEMA public TO logmaster_runtime, logmaster_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO logmaster_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO logmaster_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO logmaster_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logmaster_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO logmaster_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO logmaster_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO logmaster_backup;
SQL
} | psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v "database=$POSTGRES_DB"
