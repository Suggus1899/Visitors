# Architecture — LogMaster

## Overview

Monorepo with three main modules: `client/` (React SPA), `server/` (Express API), and root-level orchestration (Docker, Electron, scripts).

## Docker Stack

```
           ┌─────────────┐
           │   Browser   │
           └──────┬──────┘
                  │ :80 / :443
           ┌──────▼──────┐
           │   nginx     │  ← client/ (React build served)
           │  (Client)   │
           └──────┬──────┘
                  │ /api/* → proxy_pass :3000
           ┌──────▼──────┐
           │  Express    │  ← server/ (REST API)
           │  (Server)   │
           └──────┬──────┘
                  │ :5432
           ┌──────▼──────┐
           │ PostgreSQL  │  ← Stores all data + photos
           │  (DB)       │    (BLOBs in table)
           └─────────────┘
```

## Server Module Structure

```
server/src/
├── domain/            # Entities, repository interfaces, domain services
│   ├── entities/      # User, Visitor, Visit, VisitInterval, ArcoRequest
│   └── services/      # IAuthService, IPasswordPolicy
├── application/       # Use cases (orchestrate domain logic)
│   └── usecases/      # CreateUser, Login, ChangePassword, etc.
├── infrastructure/    # Implementations (JwtAuthService, EmailService, etc.)
│   └── services/      # TokenBlacklist, Encryption, EmailService
├── controllers/       # HTTP handlers (Auth, Visit, Privacy, SuperAdmin)
├── middleware/        # auth, firewall, rateLimiter, validate, mustChangePassword
├── routes/            # Express route definitions
├── models/            # Sequelize models + ActivityLog
├── migrations/        # SQL migration files (001-007)
├── shared/            # ApiResponse, Container
├── config/            # AppConfig (env), logger (winston)
├── utils/             # seeder, retention, Encryption
├── types/             # Express type augmentation (AuthPayload)
└── app.ts             # Express app setup
```

## Client Module Structure

```
client/src/
├── components/        # UI components (VisitForm, VisitsTable, etc.)
├── context/           # AuthContext (session, token management)
├── hooks/             # Custom React hooks
├── services/          # API calls
├── types/             # TypeScript interfaces
├── utils/             # Helpers (photoValidator, pdf export, etc.)
└── App.tsx            # Root React component
```

## Data Flow

1. **Auth**: Login → JWT (access + refresh) → stored in localStorage → sent as Bearer header
2. **Visits**: Check-in → Zod validation → Use case → Sequelize model → PostgreSQL
3. **Photos**: Upload → Base64 → Express multipart → File storage (disk) + BLOB (DB)
4. **Audit**: Every mutation → `logActivity()` → `ActivityLogs` table
5. **Events**: Visit mutations → `EventEmitterService` → SSE push to connected clients

## Key Design Decisions

- **Sequelize ORM** over raw SQL for portability and migration support
- **Raw SQL migrations** (007) for indexes that Sequelize doesn't generate optimally
- **Token blacklist in memory** — tradeoff: lost on restart, but avoids DB round-trips per request
- **Use cases** between controllers and repositories — keeps business logic testable
- **Container pattern** with `Container.ts` for dependency injection (no NestJS)
- **SSE (Server-Sent Events)** over WebSocket for real-time visit updates — simpler, unidirectional
- **AES-256-GCM** for PII field encryption — authenticated encryption prevents tampering
