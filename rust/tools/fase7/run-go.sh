#!/usr/bin/env bash
# Comparación fase 7 contra Go (versión original, PostgreSQL 16).
#
# Levanta el servidor Go en 127.0.0.1:18081 con una base de pruebas
# nueva (`logmaster_go_test` en 127.0.0.1:55432), siembra los 4 usuarios
# de comparación y corre `compare.py` + `load.py`.
#
# Requisitos: PostgreSQL 16 en marcha con el clúster en el puerto
# 55432 y la base `logmaster_go_test` (ver `rust/docs/comparacion-fase7.md`),
# binario Go compilado (`go build -o <bin> ./cmd/logmaster` en server-go)
# y `psql` en el PATH.
#
# Uso:
#   GO_BIN=~/workspace/.rust-verify/tools/logmaster-go bash run-go.sh [salida-dir]
# La salida (captura-go.json, carga-go.json, go-serve.log) queda en el
# directorio indicado (por defecto, el directorio de trabajo).
set -u
cd "$(dirname "$0")" || exit 1

GO_BIN="${GO_BIN:-$HOME/workspace/.rust-verify/tools/logmaster-go}"
OUT="${1:-$PWD}"
PASSWORD="${FASE7_PASSWORD:-Private!Safe12Á}"
# bcrypt de la contraseña anterior (coste 12), igual que en run-rust.sh.
HASH='$2b$12$HyU95AMIVkn/2tXDhwZa..uLdGHqbsRhvEUotKbFo98BZ5hQoVa3O'

[ -x "$GO_BIN" ] || { echo "GO_BIN no existe o no es ejecutable: $GO_BIN"; exit 1; }
mkdir -p "$OUT"

export DB_HOST=127.0.0.1 DB_PORT=55432 DB_NAME=logmaster_go_test
export DB_USER=logmaster_test DB_PASSWORD=fixture DB_SSL=false
export NODE_ENV=test PORT=18081 HTTP_HOST=127.0.0.1
# Secretos de laboratorio: se generan en cada ejecución y se guardan
# solo en el archivo .env temporal de esta corrida (0600). No van
# literales en el repo.
ENV_FILE="$OUT/go-fase7.env"
{
  echo "DB_HOST=127.0.0.1"; echo "DB_PORT=55432"; echo "DB_NAME=logmaster_go_test"
  echo "DB_USER=logmaster_test"; echo "DB_PASSWORD=fixture"; echo "DB_SSL=false"
  echo "NODE_ENV=test"; echo "PORT=18081"; echo "HTTP_HOST=127.0.0.1"
  echo "CORS_ORIGINS=http://127.0.0.1:18081"; echo "RATE_LIMIT_MAX_REQUESTS=100000"
  printf 'JWT_SECRET=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -d '\n' | head -c 64)"
  printf 'JWT_REFRESH_SECRET=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -d '\n' | head -c 64)"
  # Clave de cifrado fija (`19`x32, la del laboratorio): los índices de
  # identidad quedan preparados con ella y la siguiente corrida sobre
  # la misma base no falla por cambio de clave; además es la misma
  # que usa run-rust.sh, así que los datos cifrados son comparables.
  echo 'ENCRYPTION_KEY=1919191919191919191919191919191919191919191919191919191919191919'
  echo "EDIT_PASSWORD='Edit!2026-segura'"
  echo "BACKUP_PATH=$OUT/go-backups"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
export DOTENV_CONFIG_PATH="$ENV_FILE"
# Las variables de entorno también se exportan para `psql` y demás.
set -a; . "$ENV_FILE"; set +a
export BACKUP_PATH="$OUT/go-backups"

echo "== Go: migrar base de pruebas =="
"$GO_BIN" migrate-test || exit 1

echo "== Go: sembrar operador/admin/auditor/root =="
psql "host=127.0.0.1 port=55432 dbname=logmaster_go_test user=logmaster_test password=fixture" \
  -v ON_ERROR_STOP=1 -c \
  "INSERT INTO \"Users\"(username,email,password,role,\"mustChangePassword\",\"createdAt\",\"updatedAt\") VALUES
   ('root','r@test','${HASH}','root',false,now(),now()),
   ('operador','o@test','${HASH}','operador',false,now(),now()),
   ('admin','a@test','${HASH}','admin',false,now(),now()),
   ('auditor','u@test','${HASH}','auditor',false,now(),now())
   ON CONFLICT(username) DO NOTHING;" || exit 1

echo "== Go: serve en 127.0.0.1:18081 =="
"$GO_BIN" serve > "$OUT/go-serve.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null' EXIT
for _ in $(seq 1 30); do
  curl -fs -o /dev/null "http://127.0.0.1:18081/api/v1/health" && break
  sleep 1
done
curl -fs "http://127.0.0.1:18081/api/v1/health" || { echo "Go no responde en /api/v1/health"; exit 1; }
echo

echo "== Go: recorridos =="
python3 compare.py --base http://127.0.0.1:18081 --out "$OUT/captura-go.json" --label go --password "$PASSWORD" || echo "compare.py terminó con fallos (ver captura)"
echo "== Go: carga 100 perfiles / 1.000 visitas =="
python3 load.py --base http://127.0.0.1:18081 --out "$OUT/carga-go.json" --label go --password "$PASSWORD"
echo "== Listo: $OUT/captura-go.json $OUT/carga-go.json =="
