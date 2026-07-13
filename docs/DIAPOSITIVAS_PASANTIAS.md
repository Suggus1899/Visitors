---
marp: true
theme: default
paginate: false
size: 16:9
header: "LogMaster - Sistema de Control de Acceso de Visitantes"
footer: "Colina Martínez & Cordero Gómez | UNERG 2026"
style: |
  section {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #0f172a;
    color: #f1f5f9;
    padding: 60px;
  }
  h1 { color: #38bdf8; }
  h2 { color: #38bdf8; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
  h3 { color: #7dd3fc; }
  table { margin: 0 auto; }
  th { background: #1e3a5f; color: #38bdf8; }
  td { background: #1e293b; }
  strong { color: #fbbf24; }
  code { background: #1e293b; color: #4ade80; padding: 2px 6px; border-radius: 4px; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
  .center { text-align: center; }
  .big { font-size: 1.8em; }
---

<!-- _class: center -->

# LogMaster

## Sistema de Control de Acceso de Visitantes

<br>

**Gustavo José Colina Martínez** — C.I: 31.182.936
**Germán Rafael Cordero Gómez** — C.I: 29.858.403

<br>

Universidad Nacional Experimental Rómulo Gallegos
Área de Ingeniería de Sistemas — Programa de Ingeniería en Informática

Julio 2026

---

<!-- _class: center -->

# Contexto de la Pasantía

| | |
|---|---|
| **Empresa** | Industria de Alimentos El Trébol (Producción Humana) |
| **Ubicación** | Zona Industrial Corinsa, Cagua — Estado Aragua |
| **Departamento** | Tecnología de la Información |
| **Tutor Empresarial** | T.S.U. José Romero (Encargado de Soporte IT) |
| **Tutor Académico** | Ing. Víctor Rojas |
| **Duración** | 320 horas — 12 semanas |

---

<!-- _class: center -->

# El Problema

<br>

### Registro manual de visitantes en bitácoras de papel

<div class="columns">

**Latencia operativa**
Cuellos de botella en horas pico
Registros que toman varios minutos

**Pérdida de trazabilidad**
Registros deteriorados o extraviados
Sin auditoría ni historial confiable

**Riesgo de seguridad**
Datos personales expuestos sin cifrado
Sin control de acceso ni integridad referencial

</div>

---

<!-- _class: center -->

# Diagrama de Actividades — Flujo Manual

```
Visitante llega
    │
    ▼
Guardia anota en papel ────► Cédula, nombre, motivo
    │
    ▼
Sin validación de datos ────► Errores tipográficos
    │
    ▼
Sin fotografía ────► Sin identificación visual
    │
    ▼
Cuaderno se archiva ────► Sin búsqueda ni reportes
    │
    ▼
Sin trazabilidad ni auditoría
```

---

<!-- _class: center -->

# Propuesta de Solución — Backend

<br>

### Clean Architecture

```
┌─────────────────────────────────┐
│   Controllers (HTTP REST)       │  ← Express + Zod
├─────────────────────────────────┤
│   Application (Use Cases)       │  ← Lógica de negocio
├─────────────────────────────────┤
│   Domain (Entities + Interfaces)│  ← Reglas puras
├─────────────────────────────────┤
│   Infrastructure (Sequelize)    │  ← PostgreSQL
└─────────────────────────────────┘
```

El núcleo del negocio **no depende** de ninguna tecnología externa.

---

<!-- _class: center -->

# Stack Tecnológico — Backend

| Capa | Tecnología | Función |
|---|---|---|
| Runtime | Node.js + Express | Servidor HTTP |
| Lenguaje | TypeScript | Tipado estático, prevención de errores |
| ORM | Sequelize | Mapeo objeto-relacional |
| Base de datos | PostgreSQL 16 | Persistencia relacional ACID |
| Validación | Zod | Schemas estrictos de entrada |
| Autenticación | JWT + Refresh Tokens | Sesiones seguras (15m + 7d) |
| Cifrado | AES-256-GCM | Protección de datos personales |
| Seguridad | Helmet, Rate Limiting | Cabeceras HTTP, anti-fuerza bruta |
| Testing | Vitest + Supertest | Pruebas unitarias e integración |
| Despliegue | GitHub Actions | CI/CD automatizado |

---

<!-- _class: center -->

# Propuesta de Solución — Frontend

<br>

### Arquitectura de componentes orientada al usuario

```
┌──────────────────────────────────────┐
│  Electron (Desktop App)              │
├──────────────────────────────────────┤
│  React 18 + TypeScript               │
│  ├── HashRouter (rutas por rol)      │
│  ├── React Query (estado servidor)   │
│  ├── Server-Sent Events (tiempo real)│
│  ├── Tailwind CSS (diseño)           │
│  └── Web API (cámara / webcam)       │
├──────────────────────────────────────┤
│  API REST (Backend)                  │
└──────────────────────────────────────┘
```

---

<!-- _class: center -->

# Stack Tecnológico — Frontend

| Área | Tecnología | Función |
|---|---|---|
| Framework | React 18 + TypeScript | UI reactiva con tipado estático |
| Build | Vite | Empaquetado de alto rendimiento |
| Estilos | Tailwind CSS | Diseño adaptativo y consistente |
| Estado | React Query | Caché y sincronización servidor |
| Tiempo real | Server-Sent Events | Actualización sin recargar |
| Cámara | react-webcam | Captura biométrica y documentos |
| Gráficos | Chart.js | Dashboards analíticos |
| Reportes | jsPDF + ExcelJS | Exportación PDF y Excel |
| Seguridad | DOMPurify | Sanitización anti-XSS |
| Escritorio | Electron | Ejecutable nativo aislado |

---

<!-- _class: center -->

# Desarrollo — Clean Architecture en código

```typescript
// server/src/application/usecases/CheckInVisitor.usecase.ts
// Capa de APLICACIÓN — no depende de Sequelize ni Express

export class CheckInVisitorUseCase {
  constructor(
    private visitRepo: IVisitRepository,      // interfaz inyectada
    private visitorRepo: IVisitorRepository,   // interfaz inyectada
  ) {}

  async execute(dto: CheckInDto): Promise<Visit> {
    const visitor = await this.visitorRepo.findByCedula(dto.cedula);
    const visit = Visit.create({ visitorId: visitor.id, ...dto });
    return this.visitRepo.save(visit);
  }
}
```

**Inversión de dependencias:** el caso de uso no sabe si detrás hay PostgreSQL o un mock.

---

<!-- _class: center -->

# Desarrollo — Cifrado AES-256-GCM

```typescript
// server/src/utils/Encryption.ts
// Cada cedula y dato personal se cifra antes de persistir

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.PII_ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}
```

**Cedula:** cifrada bidireccional + hasheada para búsquedas rápidas sin exponer el dato.

---

<!-- _class: center -->

# Demostración — Wizard de Check-in

<br>

### Flujo guiado de 4 pasos para el operador

| Paso | Componente | Acción |
|---|---|---|
| **1** | VisitorLookupStep | Búsqueda por cédula + foto previa |
| **2** | VisitorInfoStep | Empresa, cargo, teléfono |
| **3** | VehicleInfoStep | Acompañantes y vehículo (opcional) |
| **4** | VisitDetailsStep | Motivo, consentimiento, fotos, submit |

<br>

**Resultado:** registro completo en menos de 30 segundos.

---

<!-- _class: center -->

# Demostración — Dashboard y Auditoría

<br>

<div class="columns">

**Panel Admin**
- Métricas en tiempo real (Chart.js)
- Visitas activas, en espera, intermitentes
- Comparativas mensuales
- Alertas de check-out omitido

**Panel Auditoría**
- Log inmutable de todas las operaciones
- Filtros por usuario, acción, fecha
- IP y userAgent registrados
- Exportación a PDF y Excel

</div>

<br>

Todo se actualiza vía **Server-Sent Events** sin recargar la página.

---

<!-- _class: center -->

# Resultados e Impacto

<br>

| Métrica | Antes (papel) | Después (LogMaster) |
|---|---|---|
| Tiempo de registro | 3-5 minutos | **< 30 segundos** |
| Trazabilidad | Nula | **100% auditada** |
| Datos personales | Expuestos | **Cifrados AES-256-GCM** |
| Reportes | Manuales | **PDF y Excel nativos** |
| Sincronización | Nula | **Tiempo real (SSE)** |
| Despliegue | N/A | **CI/CD automatizado** |

---

<!-- _class: center -->

# Competencias Aplicadas

<br>

**Gustavo — Backend**
- Clean Architecture e inversión de dependencias
- Seguridad informática: cifrado simétrico, JWT, rate limiting
- Diseño de API REST y modelado relacional
- Testing automatizado (Vitest + Supertest)
- DevOps: GitHub Actions, CI/CD

<br>

**Germán — Frontend**
- Arquitectura de componentes y patrones de diseño
- Gestión de estado asíncrono (React Query)
- Integración con hardware (Web API / webcam)
- Prevención de ataques XSS (DOMPurify)
- Empaquetado de escritorio (Electron)

---

<!-- _class: center -->

# Conclusiones

<br>

- La **seguridad** no es un añadido final: se diseña desde la primera línea de código
- **Clean Architecture** garantiza mantenibilidad y testabilidad a largo plazo
- La **experiencia de usuario** es tan crítica como la lógica de negocio: un sistema perfecto en pruebas no sirve si no se adapta a la realidad operativa
- La **automatización del despliegue** (CI/CD) elimina el error humano en el paso a producción
- El trabajo en **equipo multidisciplinario** y la comunicación clara son tan valiosos como el dominio técnico

---

<!-- _class: center -->

# Recomendaciones

<br>

<div class="columns">

**A la empresa**
- Monitoreo con Prometheus + Grafana
- Evaluar orquestación con Kubernetes
- Rotación trimestral de claves de cifrado
- Inversión en infraestructura de red local

**A la universidad**
- Talleres de DevOps (CI/CD, GitHub Actions)
- Enfoque en arquitecturas desacopladas
- Vincular proyectos finales con problemas reales
- Talleres de psicología del usuario en ingeniería

</div>

---

<!-- _class: center -->

# Agradecimientos

<br>

### Industria de Alimentos El Trébol
Por abrirnos las puertas y confiar en nuestro trabajo

### T.S.U. José Romero
Tutor empresarial — por su acompañamiento y guía técnica

### Ing. Víctor Rojas
Tutor académico — por su orientación y supervisión

### Universidad Nacional Experimental Rómulo Gallegos
Área de Ingeniería de Sistemas — Coordinación de Pasantías

---

<!-- _class: center -->

# ¡Gracias!

<br>

**LogMaster** — Sistema de Control de Acceso de Visitantes

<br>

Gustavo Colina · C.I: 31.182.936
Germán Cordero · C.I: 29.858.403

<br>

UNERG · Julio 2026
