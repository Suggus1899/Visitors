# Visión General del Sistema de Gestión de Visitas

## Introducción
Este documento proporciona una visión general de la arquitectura y los componentes del Sistema de Gestión de Visitas. El sistema está diseñado para gestionar el registro de visitantes, control de acceso y seguimiento de visitas en las instalaciones.

## Arquitectura del Sistema
El proyecto utiliza una arquitectura moderna basada en **Electron** para la aplicación de escritorio, integrando un **Frontend** en React y un **Backend** en Node.js/Express, todo empaquetado como un solo ejecutable.

### Diagrama de Alto Nivel
```mermaid
graph TD
    User[Usuario / Recepcionista] -->|Interactúa| Client[Cliente (React/Electron)]
    Client -->|API REST| Server[Servidor Local (Node.js/Express)]
    Server -->|Consultas| DB[(Base de Datos SQLite)]
```

## Stack Tecnológico

### Frontend (Cliente)
Ubicación: `/client`
- **Framework**: React (v18) con Vite.
- **Lenguaje**: TypeScript.
- **Estilos**: Tailwind CSS.
- **Iconos**: Lucide React.
- **Componentes Clave**:
  - `App.tsx`: Punto de entrada y enrutamiento.
  - `components/`: Componentes reutilizables (formularios, tablas, tarjetas).
  - `context/`: Gestión de estado global (Autenticación).

### Backend (Servidor)
Ubicación: `/server`
- **Entorno**: Node.js.
- **Framework**: Express.js.
- **Lenguaje**: TypeScript.
- **Base de Datos**: SQLite (almacenamiento local ligero y rápido).
- **ORM**: Sequelize (para modelado de datos y consultas).
- **Autenticación**: JSON Web Tokens (JWT).

### Escritorio (Electron)
Ubicación: `/electron` y raíz
- **Wrapper**: Electron.
- **Función**: Empaqueta el cliente y el servidor, gestiona el ciclo de vida de la aplicación y ventas nativas.
- **Comunicación**: IPC (Inter-Process Communication) para funciones nativas si es necesario.

## Módulos del Sistema

El sistema está dividido en varios módulos funcionales clave:

### 1. Autenticación y Usuarios
- **Descripción**: Gestión de acceso al sistema para recepcionistas y administradores.
- **Archivos Clave**:
  - Servidor: `routes/auth.routes.ts`, `models/User.ts`.
  - Cliente: `context/AuthContext.tsx`, `components/Login.tsx`.
- **Funcionalidad**: Login, registro (inicial/admin), protección de rutas.

### 2. Gestión de Visitantes (Visitors)
- **Descripción**: Registro y mantenimiento de la información de las personas que visitan las instalaciones.
- **Archivos Clave**:
  - Servidor: `models/Visitor.ts`.
  - Cliente: `components/VisitorForm.tsx`.
- **Datos**: Nombre, documento de identidad, empresa, foto, etc.

### 3. Registro de Visitas (Visits)
- **Descripción**: Control del flujo de entrada y salida de visitantes.
- **Archivos Clave**:
  - Servidor: `routes/visit.routes.ts`, `models/Visit.ts`.
  - Cliente: `components/VisitForm.tsx`, `components/ActiveVisits.tsx`.
- **Funcionalidad**: Check-in (entrada), Check-out (salida), motivo de visita, a quién visita.

### 4. Reportes y Estadísticas
- **Descripción**: Generación de informes sobre la actividad de visitas.
- **Archivos Clave**:
  - Servidor: `routes/report.routes.ts`.
  - Cliente: `components/Reports.tsx`, `components/StatisticsPanel.tsx`.
- **Funcionalidad**: Exportación a Excel/PDF (vía `jspdf`, `xlsx`), visualización de métricas.

### 5. Auditoría y Sistema
- **Descripción**: Registro de actividades del sistema y mantenimiento.
- **Archivos Clave**:
  - Servidor: `routes/activity.routes.ts`, `models/ActivityLog.ts`, `routes/backup.routes.ts`.
- **Funcionalidad**: Logs de auditoría (quién hizo qué), copias de seguridad de la base de datos.
- **Otros**: Programador de tareas (`scheduler.ts`).

## Estructura de Carpetas

```
/
├── client/                 # Código fuente del Frontend (React)
│   ├── src/
│   │   ├── components/     # Componentes de UI
│   │   ├── context/        # Estado global
│   │   ├── hooks/          # Hooks personalizados
│   │   └── types/          # Definiciones de tipos TypeScript cliente
├── server/                 # Código fuente del Backend (Node/Express)
│   ├── src/
│   │   ├── controllers/    # Lógica de negocio
│   │   ├── models/         # Modelos de base de datos (Sequelize)
│   │   ├── routes/         # Definición de endpoints API
│   │   └── middleware/     # Middlewares (auth, validación)
├── electron/               # Código específico de Electron
├── dist/                   # Build de producción (generado)
└── package.json            # Scripts principales y dependencias de Electron
```

## Comandos Principales

- **Desarrollo**: `npm run dev` (Inicia cliente y servidor concurrentemente).
- **Construcción**: `npm run dist` (Genera el instalador/ejecutable).
