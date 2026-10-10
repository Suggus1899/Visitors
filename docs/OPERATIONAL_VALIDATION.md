# Validación operativa de laboratorio — 10 de octubre de 2026

LogMaster se preparó en `main` para Linux con contenedores. Los ensayos utilizaron bases, credenciales, correo y visitantes ficticios en runners independientes de GitHub Actions. No se instaló Docker en el equipo Windows ni se modificaron sus bases o respaldos anteriores. La retención de información personal permanece desactivada.

## Evidencia por etapa

| Etapa | Implementación y comprobación |
|---|---|
| 1. Contenedores | Imágenes multietapa con versiones/digests, secretos excluidos, usuarios dedicados, datos/respaldos/contraseñas en volúmenes separados; instalación vacía y persistencia tras recreación |
| 2. HTTPS y correo | Nginx bajo el mismo origen, 5 MB, SSE sin buffering, IP del proxy verificada; cámara, Blob privado, recuperación en Mailpit y rechazo de IP falsificada |
| 3. Mantenimiento | Simulación sin mutación, destino confirmado, adopción del esquema Node ficticio y primer root; migración repetida; restauración de staging antes de aplicar y revocación/auditoría en una transacción |
| 4. Consultas | Trigramas HMAC, reconstrucción reanudable y verificación exacta; agregaciones SQL y calendario diario con detalle paginado; búsqueda corta rechazada e índice eliminado al cancelar |
| 5. Cliente y exportación | Pestañas y bibliotecas diferidas; límites PDF 2.000/Excel 20.000 antes de recopilar, cancelación y detección de totales/IDs inconsistentes; PDF y Excel descargados desde el navegador real |
| 6. Respaldos | Timers systemd adelantados en CI, conservación de 30 pares completos verificada, contraseñas cifradas separadas, exclusión mutua, estado/último éxito, límites de tamaño y errores de disco explícitos |
| 7. Rendimiento y retiro | 100.000 visitantes, 1.000.000 de visitas y 50 sesiones; compatibilidad AES, bcrypt, JWT, archivos Node y esquema en fixtures Go; backend Node retirado después de aprobar el laboratorio |

El recorrido de navegador anterior al retiro, [Containers del commit d040e64](https://github.com/Suggus1899/Visitors/actions/runs/38069769820), aprobó cuatro pruebas: operación completa con cámara/consentimiento/transiciones, restablecimiento mediante Mailpit y uso único, permisos/SSE/IP y carga diferida con descargas reales. La [CI del mismo commit](https://github.com/Suggus1899/Visitors/actions/runs/38069769795) comprobó también el backend Node antes de retirarlo.

Después del retiro, [CI de 4581a57](https://github.com/Suggus1899/Visitors/actions/runs/38070560477) y [Containers de 4581a57](https://github.com/Suggus1899/Visitors/actions/runs/38070560275) aprobaron el backend Go, cliente, auditoría de dependencias, instalación/restauración, timers, adopción, cuatro recorridos de navegador y carga pequeña. Las imágenes de esta versión están en el artefacto `logmaster-images`. La ruta PostgreSQL heredada en la imagen de herramientas de la API utiliza un montaje temporal comprobado dentro del contenedor; los datos persistentes siguen en volúmenes nombrados.

Los cuatro scripts necesarios se reubicaron en `deploy/scripts/`, por preferencia del usuario, junto a Compose, Nginx y systemd. [CI de 34181c7](https://github.com/Suggus1899/Visitors/actions/runs/38071327928) y [Containers de 34181c7](https://github.com/Suggus1899/Visitors/actions/runs/38071327979) volvieron a aprobar las comprobaciones con sus referencias actualizadas. Las imágenes vigentes también están disponibles como artefacto de ese ensayo.

Las pruebas Go con PostgreSQL real comprueban permisos, sesión revocada incluso después de crear otra instancia, búsqueda protegida y equivalencia de estadísticas. También comprueban rollback de edición/auditoría, cancelación y registro independiente, archivo dañado, clave incorrecta, esquema incompatible y fallos inducidos durante la revocación y auditoría de restauración. El ensayo CLI adopta una baseline ficticia sin tabla Goose y conserva su visita antes de crear el primer root.

## Carga completa aprobada antes del retiro

Fuente: [Full laboratory load — bc1d441](https://github.com/Suggus1899/Visitors/actions/runs/38068317402), artefacto `fictitious-load-results`. Runner Linux x86_64, 4 CPU virtuales Intel Xeon Platinum 8573C, 15,61 GiB de RAM, PostgreSQL 16 y Go 1.27.2. Se generaron 100.000 perfiles y 1.000.000 de visitas en 67,86 segundos; hubo dos minutos de calentamiento y quince de medición, con 50 sesiones.

| Medición | Resultado | Criterio |
|---|---:|---:|
| Solicitudes medidas | 47.482 | Carga mixta durante 900 s |
| p95 consultas habituales | 0,79156 s | ≤ 1 s |
| p95 búsquedas | 1,72305 s | ≤ 2 s |
| p95 operaciones | 0,34433 s | ≤ 1 s |
| Errores inesperados | 0 % | < 1 % |
| Respaldo cifrado | 88.983.933 bytes; 12,63 s | Creación y verificación exitosas |
| Restauración desechable | 25,84 s | Estado exitoso, fuente conservada |

La operación se mide por cada petición de transición; el tiempo de las cinco peticiones de un ciclo completo no se confunde con la latencia individual. El arnés abre 50 sesiones con pausa de un segundo entre recorridos; no equivale a 50 peticiones por segundo constantes. Los registros incluyen estados abiertos/cerrados, nombres frecuentes, perfiles anonimizados y fotografías ficticias. Los resultados corresponden al hardware y mezcla documentados.

El muestreo cada 15 segundos durante la carga anterior registró máximos observados de 88,84 MiB para la API y 290,60 MiB para PostgreSQL. Son muestras periódicas, no picos absolutos ni mediciones de memoria de la creación del respaldo; se conservan los registros originales en el artefacto.

Los ensayos previos que superaron objetivos no se aceptaron. Se corrigió la planificación de consultas según los parámetros reales, los índices y el cálculo de latencias. El workflow utiliza `bash` con parada ante errores de la tubería, por lo que una salida JSON con `passed: false` hace fallar la ejecución.

## Carga y recursos después del retiro

La ejecución final [Full laboratory load — dae5e51](https://github.com/Suggus1899/Visitors/actions/runs/38070296024) aprobó el mismo volumen, 50 sesiones, 120 segundos de calentamiento y 900 segundos de medición. Runner Linux x86_64, 4 CPU virtuales AMD EPYC 7763, 15,61 GiB de RAM y Go 1.27.2. La generación duró 59,53 segundos. La empresa ficticia se almacenó en texto claro, como exige el contrato de ese campo; el primer ensayo utilizaba una representación más larga. Los campos personales cifrados, anonimización y fotografías se conservaron.

| Medición final | Resultado | Criterio |
|---|---:|---:|
| Solicitudes medidas | 47.817 | Carga mixta durante 900 s |
| p95 consultas habituales | 0,68153 s | ≤ 1 s |
| p95 búsquedas | 1,46237 s | ≤ 2 s |
| p95 operaciones | 0,36842 s | ≤ 1 s |
| Errores inesperados | 0 % | < 1 % |
| Respaldo cifrado verificado | 83.169.874 bytes; 12,45 s | Exitoso |
| Restauración desechable | 18,12 s | Exitosa |

Durante la carga, el muestreo registró máximos observados de 69,72 MiB para API y 296,00 MiB para PostgreSQL. Durante respaldo/restauración se registraron 1.041,41 MiB para el proceso administrativo, 288,80 MiB para PostgreSQL fuente y 198,40 MiB para PostgreSQL desechable. El proceso administrativo y sus temporales necesitan margen adicional al consumo habitual de la API. Son muestras periódicas de `docker stats`, no picos absolutos; `resources.txt` y `backup-resources.txt` acompañan los resultados. Los límites explícitos y las pruebas de fallo de E/S permanecen activos.

El backend de aplicación no cambió entre dae5e51 y 34181c7: solo se corrigió la comprobación del montaje temporal, se reorganizaron scripts y se actualizaron referencias/manuales. La carga completa y los recorridos posteriores verifican ese mismo backend; los cambios siguientes de esta entrega son evidencia documental y un comentario de la plantilla de entorno.

## Comprobaciones locales y estructura final

- Instalación `pnpm install --frozen-lockfile` aprobada con pnpm 12.4.2; dos proyectos en el workspace: raíz y cliente.
- Tipos, lint y build del cliente aprobados; 146 pruebas en 21 archivos aprobadas.
- `go vet ./...`, `go test ./...` y compilación Go aprobados localmente. Las pruebas de integración con PostgreSQL, `-race`, sqlc y govulncheck se ejecutan en CI Linux.
- `pnpm audit --prod --audit-level moderate`: ninguna vulnerabilidad conocida después de retirar las dependencias exclusivas del backend Node.
- Administración: fragmento de 17,55 kB minificado; estadísticas, calendario, respaldos y exportadores están separados. El fragmento inicial de 578,10 kB todavía produce aviso de tamaño, y el exportador Excel ocupa 940,82 kB; se descarga al exportar. No se ocultó ese aviso.
- El código anterior está en `backup/node-before-retirement-2026-10-10` (d040e64), publicada en el remoto. Las ramas de respaldo anteriores y los dos stashes permanecen conservados.
- `server/` ya no tiene archivos versionados. Sus `.env`, `data/` y `backups/` locales se conservaron. La política automática bloqueó la eliminación de `server/node_modules`; queda ignorado y excluido del contexto Docker, sin uso por el workspace vigente.
- Codebase Memory y Graphify se actualizaron tras retirar Node. Hay límites de análisis SQL/Nginx en los grafos; los hallazgos de esas rutas se corroboraron con fuente y pruebas reales, sin interpretar ausencia en el índice como prueba de completitud.

## Reproducción y recuperación

Los comandos y precauciones están en [QUICKSTART](QUICKSTART.md) y [OPERATIONS](OPERATIONS.md). El workflow manual `Full laboratory load` ejecuta el conjunto completo; `Containers` ejecuta carga pequeña en cada push y publica `logmaster-images.tar.gz` como artefacto de siete días. Las imágenes se pueden cargar en Linux mediante `docker load -i logmaster-images.tar.gz` y usar con Compose sin volver a construirlas.

No ejecutar `down -v` sobre una instalación operativa. Usar los comandos de simulación del CLI antes de confirmar `host:puerto/base`, conservar claves y contraseña fuera del respaldo y validar una copia antes de intervenir una base anterior. La instalación física necesita servidor, hostname, certificado confiable, SMTP seguro, responsables y aceptación de operadores.

Los respaldos históricos pueden reintroducir datos cancelados. Deben revisarse las cancelaciones posteriores antes de restaurar. No se probaron datos reales, correo externo ni hardware empresarial; el laboratorio no representa aceptación institucional.
