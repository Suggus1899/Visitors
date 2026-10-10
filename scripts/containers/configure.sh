#!/bin/sh
set -eu
umask 077
directory=${LOGMASTER_CONFIG_DIR:-.local/containers}
mkdir -p "$directory"
if [ -e "$directory/app.env" ]; then
  echo 'Configuration already exists; refusing to overwrite secrets.' >&2
  exit 1
fi
password=$(openssl rand -hex 24)
printf '%s' "$password" > "$directory/db.password"
restore_password=$(openssl rand -hex 24)
printf '%s' "$restore_password" > "$directory/restore.password"
cat > "$directory/staging.env" <<EOF
DB_HOST=postgres-restore
DB_PORT=5432
DB_NAME=logmaster_restore_test
DB_USER=logmaster_restore_test
DB_PASSWORD=$restore_password
DB_SSL=false
EOF
cat > "$directory/app.env" <<EOF
DB_HOST=postgres
DB_PORT=5432
DB_NAME=logmaster_pilot
DB_USER=logmaster_pilot
DB_PASSWORD=$password
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
APP_URL=https://localhost:8443
CORS_ORIGINS=https://localhost:8443
TRUSTED_PROXY_CIDRS=${LOGMASTER_PROXY_IP:-172.30.52.10}/32
RATE_LIMIT_MAX_REQUESTS=6000
SEED_ROOT_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_ADMIN_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_OPERADOR_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_GUARD_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_AUDITOR_PASSWORD=Fixture!$(openssl rand -hex 12)
SEED_DEMO_PASSWORD=Fixture!$(openssl rand -hex 12)
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout "$directory/tls.key" -out "$directory/tls.pem" >/dev/null 2>&1
sed -e 's/DB_NAME=logmaster_pilot/DB_NAME=logmaster_load_test/' -e 's/DB_USER=logmaster_pilot/DB_USER=logmaster_load_test/' -e 's/NODE_ENV=development/NODE_ENV=test/' "$directory/app.env" > "$directory/load.env"
printf 'LAB_PASSWORD=Fixture!%s\n' "$(openssl rand -hex 12)" >> "$directory/load.env"
# Compose file secrets are bind-mounted; the dedicated container users need read access.
chmod 644 "$directory"/*
echo 'Fictitious configuration created; the private parent directory remains mode 700.'
