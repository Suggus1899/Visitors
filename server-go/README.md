# Backend vigente de LogMaster

Los comandos de preparación, arranque y pruebas están en [README](../README.md) y [QUICKSTART](../docs/QUICKSTART.md).

| Directorio | Responsabilidad |
|---|---|
| `cmd/logmaster` | Servidor y comandos explícitos de operación |
| `internal/httpapi` | Rutas, autorización y operaciones transaccionales |
| `internal/config` | Entorno, conexión y restricciones de validación |
| `internal/security` | Contraseñas y compatibilidad criptográfica |
| `internal/backup` | Respaldos cifrados y restauración aislada |
| `internal/store` | Código generado por sqlc; editar sus consultas de origen |
| `db` | Esquema, consultas y migraciones Goose |
| `contracts` | Rutas y fixtures ficticios de interoperabilidad Node/Go |

Las pruebas de cada paquete están junto a su implementación. `sqlc.yaml` fija el origen de las consultas y del esquema. No guardar ejecutables, cobertura, secretos ni datos en este directorio.
