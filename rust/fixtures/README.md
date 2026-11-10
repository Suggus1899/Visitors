# Fixtures de la fase 0 — corte congelado

Copia de referencia del sistema actual, exportada para que las pruebas de
paridad de la migración (documento, sección 19) comparen contra los
mismos datos que la versión Go, sin depender del código Go en tiempo de
prueba.

Origen: rama `rust-migration`, punto `b5516b96`
("docs: agrega linea base tecnica de LogMaster", 2026-11-10), cuyo único
cambio respecto al corte de referencia `b760bc8` (2026-10-31) es
documentación, sin cambios funcionales.

## Contenido

| Archivo | Origen | Uso |
| --- | --- | --- |
| `routes.json` | Copia íntegra de `server-go/contracts/routes.json` en el corte | Inventario de las 59 rutas: método, path, protección, middleware, binario/stream. La prueba de paridad de rutas (fase 4) debe pasar familia a familia contra este archivo. |
| `roles.md` | Tabla de autorización de la línea base, sección 3 | Casos de la prueba de roles: mismo rol, misma ruta, mismo resultado esperado. |
| `baseline.md` | Línea base técnica, secciones 2, 6 y 11 | Referencia del corte: commits, versiones, migraciones 00001–00006 y límites que la versión Rust debe reproducir. |

## Reglas

- Estos archivos son **congelados**: si el sistema Go cambia, se registra
  el delta aquí antes de comparar resultados (línea base, sección 12).
- No contienen datos reales ni secretos: solo contrato, roles y
  referencias. Los datos ficticios de laboratorio y los respaldos de
  prueba se generan con los comandos existentes (`seed`, `lab`) y no se
  versionan.
- Verificación rápida: 59 rutas, 53 protegidas y 6 públicas; familias
  auth 7, visits 16, visitors 8, privacy 7, audit 6, superadmin 6,
  reports 4, backups 3, events 1, health 1.
