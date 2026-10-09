# Servidor TypeScript conservado

Este directorio contiene el backend anterior, sus migraciones y las pruebas de compatibilidad. El arranque predeterminado utiliza [server-go](../server-go). Se conserva para el ensayo de reversión descrito en [BACKEND_GO_MIGRATION](../docs/BACKEND_GO_MIGRATION.md).

Desde la raíz: `pnpm test:legacy`, `pnpm typecheck:legacy` y, únicamente sobre una copia de validación, `pnpm local:start:legacy`. No ejecutar los scripts de limpieza o sincronización contra una base operativa.
