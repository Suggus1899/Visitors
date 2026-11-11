# Arnés de comparación de la fase 7 (Go vs Rust)

Recorridos y carga pequeña contra los dos servidores en marcha, en el
mismo entorno y con los mismos datos. Solo Python 3 estándar
(`urllib`); no requiere paquetes.

## Qué hay

| Archivo | Uso |
| --- | --- |
| `compare.py` | Recorridos (salud, auth, matriz de roles, check-in, ciclo completo, cancelación, ARCO, consultas, reportes, auditoría, exportaciones, errores de contrato, SSE, superadmin) contra una versión; guarda la captura normalizada. Con `--diff` compara dos capturas paso a paso. |
| `load.py` | Siembra 100 perfiles / 1.000 visitas por la API y mide p95 (rango más cercano, como el `lab` de Go), p50, máximo y errores por ruta. |
| `run-go.sh` | Levanta Go en 127.0.0.1:18081 con base de pruebas nueva y corre los dos scripts. |
| `run-rust.sh` | Levanta Rust en 127.0.0.1:18085 (SQLite por defecto; `ENGINE=postgres` para PostgreSQL) y corre los dos scripts. |

## Preparar el entorno (una vez)

PostgreSQL 16 en marcha con un clúster en `127.0.0.1:55432` y las
bases de pruebas (los nombres los exige el guard de Go):

```sh
su postgres -c "psql -p 55432 -c \"CREATE ROLE logmaster_test LOGIN PASSWORD 'fixture' CREATEDB;\""
su postgres -c "psql -p 55432 -c \"CREATE DATABASE logmaster_go_test OWNER logmaster_test;\""
su postgres -c "psql -p 55432 -c \"CREATE DATABASE logmaster_rust_test OWNER logmaster_test;\""
```

Binario Go (desde la raíz del repo, con Go 1.27):

```sh
go build -o /ruta/logmaster-go ./cmd/logmaster   # en server-go/
```

Binario Rust (desde `rust/`):

```sh
cargo build -p logmaster
```

## Comparación completa

```sh
GO_BIN=/ruta/logmaster-go bash run-go.sh /ruta/salida
RUST_BIN=rust/target/debug/logmaster bash run-rust.sh /ruta/salida
ENGINE=postgres DATABASE_URL=postgres://logmaster_test:fixture@127.0.0.1:55432/logmaster_rust_test \
  RUST_BIN=rust/target/debug/logmaster bash run-rust.sh /ruta/salida
python3 compare.py --diff /ruta/salida/captura-go.json /ruta/salida/captura-rust.json
python3 compare.py --diff /ruta/salida/captura-go.json /ruta/salida/captura-rust-pg.json
```

Cada `run-*.sh` usa su propia base nueva (la siembra de `load.py`
destruiría la comparación de recorridos si compartieran base, porque
los totales cambian), así que los recorridos y la carga corren
seguidos sobre la misma base dentro de cada script: primero
`compare.py` (base con solo los 4 usuarios) y después `load.py`
(siembra 100 perfiles / 1.000 visitas sobre esa misma base).

## Decisiones del arnés

- **Usuarios sembrados** (`root`, `operador`, `admin`, `auditor`,
  contraseña `FASE7_PASSWORD` o `Private!Safe12Á` por defecto,
  `mustChangePassword=false`): inserción directa en la base, igual
  en ambas versiones, para no depender del `seed` de Go (que marca
  cambio obligatorio) ni del `init` de Rust (que solo crea root).
- **Límite de peticiones levantado** (`RATE_LIMIT_MAX_REQUESTS=100000`
  en ambas versiones): la siembra hace ~2.000 escrituras seguidas y
  el límite general (100/60 s) la cortaría. El límite en sí se
  verifica en las pruebas propias de cada versión (`rate_test.go`,
  `rate_limit.rs`); aquí se mide latencia de rutas, con el mismo
  trato en ambos lados.
- **Origen**: los scripts envían `Origin` igual a la base del
  servidor. Go lo exige en `CORS_ORIGINS`; Rust acepta su propio
  origen (además de `APP_URL`).
- **Normalización**: ids, tokens, fechas, hashes y huellas se
  sustituyen por marcadores antes de comparar. Los totales y la
  paginación sí se comparan.
- **Diferencias conocidas** (ver `docs/comparacion-fase7.md`):
  404/405 sin sobre de error en Axum; `GET /health` solo existe en
  Rust; los respaldos usan formatos distintos (`pg_dump` personalizado
  en Go, `logmaster-rust/1` en Rust) y no son restaurables entre
  versiones.

## Salidas

`captura-<versión>.json` (pasos con código, cuerpo normalizado y
milisegundos), `carga-<versión>.json` (siembra, totales y p95 por
ruta) y el log del servidor. La tabla de p95 y los veredictos por eje
viven en `rust/docs/comparacion-fase7.md`.
