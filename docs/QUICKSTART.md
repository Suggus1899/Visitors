# Inicio rápido de LogMaster con Go

Requisitos y comandos vigentes en [README](../README.md). Desde PowerShell 7:

```powershell
pnpm install --frozen-lockfile
pnpm local:setup
pnpm local:prepare
pnpm local:start
```

Usa `.env.logmaster-go_dev.local`; los datos quedan en la base independiente `logmaster_go_dev`. La cuenta inicial es `root`, con `SEED_ROOT_PASSWORD` y cambio obligatorio. Cliente en http://localhost:5173, API en http://127.0.0.1:3000 y Mailpit en http://127.0.0.1:8025.

```powershell
pnpm test
pnpm test:integration
pnpm build
```

Las migraciones son explícitas. `local:start` comprueba el esquema y no lo sincroniza. Para la reversión y la evidencia de cada etapa, consulta [BACKEND_GO_MIGRATION](BACKEND_GO_MIGRATION.md).
