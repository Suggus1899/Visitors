# Inicio rápido de LogMaster con Go

Requisitos y comandos vigentes en [README](../README.md). En Linux, con Docker Compose y OpenSSL instalados:

```sh
sh scripts/containers/configure.sh
docker compose --profile test build
docker compose --profile test up -d --wait postgres mailpit
docker compose run --rm ops migrate
docker compose run --rm ops seed
docker compose --profile test up -d --wait api web
```

Usa secretos privados en `.local/containers`; los datos ficticios quedan en el volumen PostgreSQL piloto. Root usa SEED_ROOT_PASSWORD y debe cambiarla al entrar. Acceso HTTPS en https://localhost:8443 con certificado temporal de localhost. El override deploy/compose.test.yaml habilita diagnósticos en loopback. No crea Visitors-local.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:integration
pnpm build
```

Las migraciones son explícitas; el arranque solo comprueba el esquema y el índice. Para instalación empresarial, SMTP seguro, claves, adopción y restauración confirmada, consulta [OPERATIONS](OPERATIONS.md). El [registro de migración](BACKEND_GO_MIGRATION.md) conserva la evidencia histórica.
