#!/usr/bin/env bash
# Comparación fase 7 contra Rust (versión nueva).
#
# Levanta el binario Rust en 127.0.0.1:18085 con una base nueva y corre
# `compare.py` + `load.py`. Dos motores:
#   ENGINE=sqlite   (por defecto) base SQLite temporal
#   ENGINE=postgres base PostgreSQL 16 (`DATABASE_URL`, p. ej.
#                   postgres://logmaster_test:fixture@127.0.0.1:55432/logmaster_rust_test)
#
# Uso:
#   RUST_BIN=.../rust/target/debug/logmaster bash run-rust.sh [salida-dir]
#   ENGINE=postgres DATABASE_URL=... RUST_BIN=... bash run-rust.sh [salida-dir]
# La salida (captura-rust[-pg].json, carga-rust[-pg].json, rust-serve.log)
# queda en el directorio indicado (por defecto, el directorio de trabajo).
set -u
cd "$(dirname "$0")" || exit 1

RUST_BIN="${RUST_BIN:-$HOME/workspace/.rust-verify/visitors-rust-f7/rust/target/debug/logmaster}"
OUT="${1:-$PWD}"
ENGINE="${ENGINE:-sqlite}"
PASSWORD="${FASE7_PASSWORD:-Private!Safe12Á}"
# bcrypt de la contraseña anterior (coste 12), igual que en run-go.sh.
HASH='$2b$12$HyU95AMIVkn/2tXDhwZa..uLdGHqbsRhvEUotKbFo98BZ5hQoVa3O'
SUFFIX=""
[ "$ENGINE" = "postgres" ] && SUFFIX="-pg"

[ -x "$RUST_BIN" ] || { echo "RUST_BIN no existe o no es ejecutable: $RUST_BIN"; exit 1; }
mkdir -p "$OUT"

export LOGMASTER_CONFIG=/dev/null
# Secretos de laboratorio: se generan en cada ejecución (no van
# literales en el repo). La clave de cifrado es fija (`19`x32) para
# que los datos cifrados de esta corrida sean legibles por `convert`
# y `preflight` si hace falta inspeccionarlos después.
export JWT_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | head -c 64)"
export JWT_REFRESH_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | head -c 64)"
export ENCRYPTION_KEY=1919191919191919191919191919191919191919191919191919191919191919
export EDIT_PASSWORD='Edit!2026-segura'
export LOGMASTER_BIND=127.0.0.1 LOGMASTER_PORT=18085 LOGMASTER_TLS=false
export RATE_LIMIT_MAX_REQUESTS=100000
# Carpeta de respaldos de esta corrida: sin ella, el listado de
# respaldos responde 500 (`BACKUP_PATH required`) mientras que Go
# lista vacío; el arnés debe comparar con la misma configuración.
export BACKUP_PATH="$OUT/rust-backups${SUFFIX}"

if [ "$ENGINE" = "postgres" ]; then
  [ -n "${DATABASE_URL:-}" ] || { echo "ENGINE=postgres exige DATABASE_URL"; exit 1; }
  export LOGMASTER_DATABASE=postgres
  DB_URL="$DATABASE_URL"
else
  export LOGMASTER_DATABASE=sqlite
  export LOGMASTER_DB_PATH="$OUT/rust-fase7${SUFFIX}.db"
  rm -f "$LOGMASTER_DB_PATH" "$LOGMASTER_DB_PATH-shm" "$LOGMASTER_DB_PATH-wal"
fi

echo "== Rust ($ENGINE): migrate =="
"$RUST_BIN" migrate || exit 1

echo "== Rust ($ENGINE): sembrar operador/admin/auditor/root =="
if [ "$ENGINE" = "postgres" ]; then
  # psql acepta la URL de conexión tal cual, incluida la clave.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO \"Users\"(username,email,password,role,\"mustChangePassword\",\"createdAt\",\"updatedAt\") VALUES
   ('root','r@test','${HASH}','root',false,now(),now()),
   ('operador','o@test','${HASH}','operador',false,now(),now()),
   ('admin','a@test','${HASH}','admin',false,now(),now()),
   ('auditor','u@test','${HASH}','auditor',false,now(),now())
   ON CONFLICT(username) DO NOTHING;" || exit 1
else
  sqlite3 "$LOGMASTER_DB_PATH" "INSERT INTO \"Users\"(username,email,password,role,\"mustChangePassword\",\"createdAt\",\"updatedAt\") VALUES
   ('root','r@test','${HASH}','root',0,'2026-11-11T00:00:00.000000Z','2026-11-11T00:00:00.000000Z'),
   ('operador','o@test','${HASH}','operador',0,'2026-11-11T00:00:00.000000Z','2026-11-11T00:00:00.000000Z'),
   ('admin','a@test','${HASH}','admin',0,'2026-11-11T00:00:00.000000Z','2026-11-11T00:00:00.000000Z'),
   ('auditor','u@test','${HASH}','auditor',0,'2026-11-11T00:00:00.000000Z','2026-11-11T00:00:00.000000Z');" || exit 1
fi

echo "== Rust ($ENGINE): serve en 127.0.0.1:18085 =="
"$RUST_BIN" serve > "$OUT/rust-serve${SUFFIX}.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null' EXIT
for _ in $(seq 1 30); do
  curl -fs -o /dev/null "http://127.0.0.1:18085/api/v1/health" && break
  sleep 1
done
curl -fs "http://127.0.0.1:18085/api/v1/health" || { echo "Rust no responde en /api/v1/health"; exit 1; }
echo

echo "== Rust ($ENGINE): recorridos =="
python3 compare.py --base http://127.0.0.1:18085 --out "$OUT/captura-rust${SUFFIX}.json" --label "rust${SUFFIX}" --password "$PASSWORD" || echo "compare.py terminó con fallos (ver captura)"
echo "== Rust ($ENGINE): carga 100 perfiles / 1.000 visitas =="
python3 load.py --base http://127.0.0.1:18085 --out "$OUT/carga-rust${SUFFIX}.json" --label "rust${SUFFIX}" --password "$PASSWORD"
echo "== Listo: $OUT/captura-rust${SUFFIX}.json $OUT/carga-rust${SUFFIX}.json =="
