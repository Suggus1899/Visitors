#!/bin/sh
set -eu
umask 077
directory=${LOGMASTER_CONFIG_DIR:-.local/containers}
mkdir -p "$directory"
chmod 700 "$directory"
if [ -e "$directory/app.env" ]; then
  echo 'Configuration already exists; refusing to overwrite secrets.' >&2
  exit 1
fi
password=$(openssl rand -hex 24)
runtime_password=$(openssl rand -hex 24)
backup_db_password=$(openssl rand -hex 24)
app_url=${LOGMASTER_APP_URL:-https://localhost:8443}
printf '%s' "$password" > "$directory/db.password"
printf '%s' "$runtime_password" > "$directory/runtime.db.password"
printf '%s' "$backup_db_password" > "$directory/backup.db.password"
restore_password=$(openssl rand -hex 24)
printf '%s' "$restore_password" > "$directory/restore.password"
cat > "$directory/app.env" <<EOF
DB_HOST=postgres
DB_PORT=5432
DB_NAME=logmaster_pilot
DB_USER=logmaster_runtime
DB_PASSWORD=$runtime_password
NODE_ENV=development
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EDIT_PASSWORD=$(openssl rand -hex 24)
BACKUP_PASSWORD=$(openssl rand -hex 32)
BACKUP_PATH=/var/lib/logmaster/backups
BACKUP_PASSWORD_PATH=/var/lib/logmaster/passwords
RETENTION_ENABLED=false
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_TLS_MODE=local
EMAIL_FROM=logmaster@example.test
APP_URL=$app_url
CORS_ORIGINS=$app_url
TRUSTED_PROXY_CIDRS=${LOGMASTER_PROXY_IP:-172.30.52.10}/32
RATE_LIMIT_MAX_REQUESTS=6000
SEED_ROOT_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_ADMIN_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_OPERADOR_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_GUARD_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_AUDITOR_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_DEMO_PASSWORD=Fixture!$(openssl rand -hex 12)
EOF
cat > "$directory/frontend.env" <<EOF
APP_URL=$app_url
GO_API_URL=http://api:3000
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,DNS:web,IP:127.0.0.1' -keyout "$directory/tls.key" -out "$directory/tls.pem" >/dev/null 2>&1
write_variant() {
  input=$1 output=$2 user=$3 db_name=$4 db_password=$5 host=$6 node_env=$7
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      DB_HOST=*) printf 'DB_HOST=%s\n' "$host" ;;
      DB_NAME=*) printf 'DB_NAME=%s\n' "$db_name" ;;
      DB_USER=*) printf 'DB_USER=%s\n' "$user" ;;
      DB_PASSWORD=*) printf 'DB_PASSWORD=%s\n' "$db_password" ;;
      NODE_ENV=*) printf 'NODE_ENV=%s\n' "$node_env" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$input" > "$output"
}
write_variant "$directory/app.env" "$directory/maintenance.env" logmaster_pilot logmaster_pilot "$password" postgres development
write_variant "$directory/app.env" "$directory/backup.env" logmaster_backup logmaster_pilot "$backup_db_password" postgres development
write_variant "$directory/maintenance.env" "$directory/staging.env" logmaster_restore_test logmaster_restore_test "$restore_password" postgres-restore development
sed -n 's/^SEED_ROOT_PASSWORD=//p' "$directory/app.env" > "$directory/maintenance.password"
write_variant "$directory/maintenance.env" "$directory/load.env" logmaster_load_test logmaster_load_test "$password" postgres test
printf 'LAB_PASSWORD=Fixture!%s\n' "$(openssl rand -hex 12)" >> "$directory/load.env"
write_variant "$directory/load.env" "$directory/load-runtime.env" logmaster_runtime logmaster_load_test "$runtime_password" postgres test
write_variant "$directory/load.env" "$directory/load-backup.env" logmaster_backup logmaster_load_test "$backup_db_password" postgres test
# Compose file secrets are bind-mounted; the dedicated container users need read access.
chmod 644 "$directory"/*
echo 'Fictitious configuration created; the private parent directory remains mode 700.'
