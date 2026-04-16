# Roadmap AF Visitor System — v1.0.0 a v7.0.0

Planificación evolutiva del producto SaaS híbrido de gestión de visitantes, desde la estabilización del MVP hasta una plataforma comercial multi-cliente de nivel enterprise.

---

## Principios del Roadmap

- **Escalabilidad progresiva**: cada versión mayor amplía el mercado objetivo
- **Backwards compatibility**: cambios breaking solo en versiones mayores
- **Security-first**: los hotfixes de seguridad nunca esperan a la siguiente versión
- **Modelo híbrido**: desktop Electron para operación diaria + panel web cloud para administración

---

## v1.0.1 — Hotfix de Seguridad Crítica

**Tiempo estimado:** 1-2 días  
**Objetivo:** Hacer el sistema seguro para cualquier despliegue real

| # | Mejora | Área |
|---|--------|------|
| 1 | Sanitizar DB_ENCRYPTION_KEY antes de PRAGMA en database.ts (SQL Injection T-01) | Backend |
| 2 | Eliminar passwords hardcodeadas en seeder.ts; reemplazar con variables de entorno | Backend |
| 3 | Forzar `mustChangePassword: true` en TODOS los usuarios del seeder sin excepción | Backend |
| 4 | Eliminar logging de contraseñas en texto plano al stdout | Backend |
| 5 | Completar owner en package.json para auto-updater funcional | Electron |

---

## v1.1.0 — Calidad y Estabilidad

**Tiempo estimado:** 1-2 semanas  
**Objetivo:** Producto robusto, testeable y mantenible

| # | Mejora | Área |
|---|--------|------|
| 1 | Ampliar tests a 70%+ cobertura (Admin, Audit, Backup, SuperAdmin) | Testing |
| 2 | Tests E2E con Playwright: login → check-in → check-out | Testing |
| 3 | Reemplazar `Loading...` en blanco con skeletons/spinners por rol | Frontend |
| 4 | Error boundaries React para evitar pantallas en blanco | Frontend |
| 5 | Estabilizar flujo de migraciones SQL (apply-migrations.ts documentado) | Backend |
| 6 | Firma del ejecutable Windows (Authenticode / self-signed) | Electron |
| 7 | Setup wizard de primer arranque (reemplaza usuarios default inseguros) | Frontend + Backend |

---

## v1.2.0 — Funcionalidades Operativas

**Tiempo estimado:** 3-4 semanas  
**Objetivo:** Aumentar el valor diario para el guardia y el administrador

| # | Mejora | Área |
|---|--------|------|
| 1 | Pase de visitante imprimible: PDF con foto, nombre, QR, hora de entrada | Frontend |
| 2 | Alertas automáticas: visitante sin checkout > X horas, visitas pendientes al cierre del día | Backend + Frontend |
| 3 | Lista negra de visitantes: bloquear ingreso con alerta al guardia | Backend + Frontend |
| 4 | Pre-registro de visitas: el anfitrión registra al visitante antes de llegar | Backend + Frontend |
| 5 | Filtros avanzados en visitas activas (empresa, propósito, duración, área) | Frontend |
| 6 | Exportación de fotos en reportes PDF | Backend |
| 7 | Configuración de retención de datos por interfaz (no solo .env) | Admin Panel |

---

## v2.0.0 — Seguridad Enterprise

**Tiempo estimado:** 1-2 meses  
**Objetivo:** Cumplimiento ISO 27001 completo; elegible para clientes grandes

| # | Mejora | Área |
|---|--------|------|
| 1 | MFA/2FA con TOTP (Google Authenticator / Authy) para admin y superadmin | Backend + Frontend |
| 2 | SSO / Active Directory (LDAP básico) para autenticación corporativa | Backend |
| 3 | Política de contraseñas por rol configurable desde el panel | Backend + Admin |
| 4 | Auditoría de sesiones: registrar dispositivo, IP, duración de cada sesión | Backend |
| 5 | Cifrado de extremo a extremo para fotos en reposo (nivel de archivo) | Backend |
| 6 | Pen test automatizado con OWASP ZAP en el pipeline | CI/CD |
| 7 | Reporte de cumplimiento ISO 27001 generado automáticamente | Backend + Admin |
| 8 | Migraciones versionadas con Umzug (reemplaza DB_SYNC_ALTER) | Backend |

---

## v3.0.0 — Multi-Sede y Panel Cloud

**Tiempo estimado:** 2-3 meses  
**Objetivo:** Expansión a clientes medianos y grandes; introducir el modelo híbrido cloud

| # | Mejora | Área |
|---|--------|------|
| 1 | Arquitectura multi-tenant: separación de datos por cliente (tenant_id) | Backend |
| 2 | Panel web de administración cloud: dashboard consolidado de todas las sedes | Web SaaS |
| 3 | Sincronización desktop ↔ cloud: la app local sincroniza datos al servidor central | Electron + Backend |
| 4 | Gestión de sedes desde el panel: crear, configurar y monitorear cada sede | Web SaaS |
| 5 | Dashboard de métricas en tiempo real: afluencia por hora, picos, tendencias entre sedes | Web SaaS |
| 6 | Roles multi-sede: admin puede gestionar múltiples instalaciones | Backend |
| 7 | CI/CD con GitHub Actions: lint → test → build → release automático por plataforma | DevOps |
| 8 | Infraestructura cloud con Docker + deploy automatizado | DevOps |

---

## v4.0.0 — Integraciones Externas

**Tiempo estimado:** 2-3 meses  
**Objetivo:** Conectar con el ecosistema empresarial del cliente

| # | Mejora | Área |
|---|--------|------|
| 1 | API pública REST con autenticación por API Key para integraciones de terceros | Backend |
| 2 | Webhooks: notificaciones en tiempo real a sistemas externos (check-in, check-out, alertas) | Backend |
| 3 | Integración HR/ERP: importar empleados (anfitriones) desde SAP, Odoo, Google Workspace | Backend |
| 4 | Integración con hardware: lectores de tarjetas, torniquetes, cámaras IP (API genérica) | Backend + Electron |
| 5 | Integración con Slack / Teams: notificaciones de visitas al anfitrión | Backend |
| 6 | Calendario de Outlook / Google Calendar: sincronizar pre-registros con calendario corporativo | Backend |
| 7 | Firma digital de visitantes en tablet (consentimiento GDPR en el acto) | Frontend |
| 8 | SDK/biblioteca cliente para integraciones personalizadas | DevOps |

---

## v5.0.0 — Aplicación Móvil

**Tiempo estimado:** 3-4 meses  
**Objetivo:** Extender el sistema a dispositivos móviles para guardias y anfitriones

| # | Mejora | Área |
|---|--------|------|
| 1 | App móvil para guardias (React Native): ver visitas activas, check-out desde móvil | Mobile |
| 2 | App móvil para anfitriones: recibir notificación de llegada del visitante, confirmar entrada | Mobile |
| 3 | Escaneo de QR / cédula con cámara: registro automático de visitante desde móvil | Mobile |
| 4 | Modo offline con sincronización posterior: el guardia puede operar sin red y sincronizar | Mobile |
| 5 | Biometría opcional: desbloquear app con huella / Face ID | Mobile |
| 6 | Push notifications nativas para alertas de visitantes | Mobile |
| 7 | Publicación en Google Play Store y distribución enterprise (TestFlight / Firebase) | Mobile |

---

## v6.0.0 — Inteligencia y Analytics

**Tiempo estimado:** 3-4 meses  
**Objetivo:** Agregar valor con datos e inteligencia artificial

| # | Mejora | Área |
|---|--------|------|
| 1 | Reconocimiento facial opcional: identificación automática de visitantes recurrentes | Backend + Electron |
| 2 | Detección de anomalías: alertas por comportamiento inusual (visitas a horas extrañas, frecuencia) | Backend (ML) |
| 3 | Predicción de afluencia: estimar picos de visitas por histórico para planificación | Backend (ML) |
| 4 | Reportes ejecutivos automáticos: resumen semanal/mensual enviado por email al gerente | Backend |
| 5 | Análisis de tiempo promedio de visita por propósito, empresa, departamento | Backend + Web |
| 6 | Mapa de calor de movimiento por hora y zona de las instalaciones | Web SaaS |
| 7 | API de Analytics exportable a herramientas BI (Power BI, Tableau, Looker) | Backend |
| 8 | Panel de compliance automático: alertas si se supera retención de datos sin purga | Backend |

---

## v7.0.0 — Plataforma Enterprise Global

**Tiempo estimado:** 4-6 meses  
**Objetivo:** Producto maduro, certificable, escalable a nivel global

| # | Mejora | Área |
|---|--------|------|
| 1 | Certificación SOC 2 Tipo II: auditoría y controles documentados para clientes enterprise | Compliance |
| 2 | Multi-idioma (i18n): español, inglés, portugués como mínimo | Frontend + Mobile |
| 3 | Multi-moneda y facturación integrada: gestión de planes, pagos (Stripe), facturación automática | Web SaaS |
| 4 | Marketplace de integraciones: catálogo donde los clientes activan integraciones | Web SaaS |
| 5 | Arquitectura de microservicios: separar auth, visits, analytics, notifications en servicios independientes | Backend |
| 6 | Alta disponibilidad y recuperación ante desastres: replicación de BD, failover automático | DevOps |
| 7 | Autoscaling en nube: soporte para picos masivos de tráfico (K8s / ECS) | DevOps |
| 8 | White-label: el producto puede ser rebrandeado por revendedores | Frontend + Web SaaS |
| 9 | Portal de desarrolladores: documentación pública de la API, sandbox de pruebas | Web SaaS |
| 10 | SLA garantizado (99.9% uptime): infraestructura redundante con monitoreo 24/7 | DevOps |

---

## Visión General del Roadmap

```
Estado actual: v1.0.0-rc.2 (desktop Electron, funcional, con brechas de seguridad)
        │
        ▼
v1.0.1  ──  Hotfix seguridad crítica                    [1-2 días]
v1.1.0  ──  Calidad, tests, estabilidad                 [2 semanas]
v1.2.0  ──  Funcionalidades operativas clave            [1 mes]
        │
        ▼
v2.0.0  ──  Seguridad enterprise, ISO 27001, MFA       [1-2 meses]
        │
        ▼
v3.0.0  ──  Multi-sede, Panel cloud, CI/CD             [2-3 meses]
        │
        ▼
v4.0.0  ──  API pública, Webhooks, Integraciones ERP   [2-3 meses]
        │
        ▼
v5.0.0  ──  App móvil (guardias + anfitriones)         [3-4 meses]
        │
        ▼
v6.0.0  ──  Analytics, ML, Reportes ejecutivos         [3-4 meses]
        │
        ▼
v7.0.0  ──  Plataforma enterprise global, SOC 2, i18n  [4-6 meses]
```

**Tiempo total estimado:** ~18-24 meses de desarrollo activo

---

## Mercado Objetivo por Versión

| Versión | Mercado |
|---------|---------|
| v1.x | Una empresa, 1 sede, instalación directa |
| v2.0 | Empresas con requisitos de seguridad y compliance |
| v3.0 | Clientes medianos con múltiples sedes |
| v4.0 | Empresas con ecosistemas ERP/HR existentes |
| v5.0 | Organizaciones con operaciones móviles |
| v6.0 | Clientes que valoran inteligencia de datos |
| v7.0 | Corporativos globales, revendedores, plataforma madura |
