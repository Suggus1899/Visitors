# Visitor System — Global Rules

description: Project-specific rules for the Visitor Access Control System
tags: [electron, react, express, clean-architecture, sqlcipher]

---

## Skills Reference

> **When to invoke skills:** Use `.agents/skills/` directories via `skill` tool when tasks match descriptions below.

| Skill                     | Location                                    | Use When                                 |
| ------------------------- | ------------------------------------------- | ---------------------------------------- |
| accessibility             | `.agents/skills/accessibility/`             | WCAG audit, keyboard nav, screen readers |
| frontend-design           | `.agents/skills/frontend-design/`           | UI components, layouts, styling          |
| nodejs-backend-patterns   | `.agents/skills/nodejs-backend-patterns/`   | API design, middleware, error handling   |
| nodejs-best-practices     | `.agents/skills/nodejs-best-practices/`     | Architecture decisions, security         |
| seo                       | `.agents/skills/seo/`                       | Meta tags, structured data, optimization |
| typescript-advanced-types | `.agents/skills/typescript-advanced-types/` | Complex type logic, generics             |

---

## Project Architecture

### Stack

```
Frontend:    React 18 + Vite + Tailwind + Lucide Icons
Backend:     Node.js + Express + TypeScript + Sequelize
Database:    SQLite + SQLCipher (AES-256 encryption)
Desktop:     Electron 40 + electron-builder + auto-updater
Testing:     Vitest (unit/integration) + Supertest
```

### Clean Architecture Layers (`server/src/`)

```
/domain/           → Entities, Repository interfaces, Value objects
/application/      → Use cases, DTOs, Business logic
/infrastructure/   → Sequelize repos, Services, External APIs
/controllers/      → HTTP request handlers (thin)
/routes/           → Route definitions + middleware chain
/middleware/       → auth, validation, rate limiting, error handling
```

**Rule:** Business logic lives in `/application/usecases/`, never in controllers.

---

## Code Standards

### TypeScript

- `strict: true` always enabled
- No implicit `any` — explicit types for function params
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties

### Naming Conventions

| Type         | Pattern                          | Example                     |
| ------------ | -------------------------------- | --------------------------- |
| Entities     | PascalCase, singular             | `Visit.entity.ts`           |
| Use cases    | PascalCase + suffix              | `CheckInVisitor.usecase.ts` |
| Repositories | Interface: `I{Entity}Repository` | `IVisitRepository`          |
| Models       | PascalCase + Model suffix        | `VisitModel`                |
| DTOs         | PascalCase + Dto suffix          | `CheckInDto`                |
| Routes       | kebab-case + suffix              | `visit-clean.routes.ts`     |

### Imports (descending order)

1. External libraries (react, express)
2. Absolute project imports (`@/components`, `../../domain/`)
3. Relative imports (`./utils`)
4. Type-only imports (`import type { ... }`)

---

## Decision Trees

### Adding a new feature?

```
1. Define entity in /domain/entities/
2. Create/update repository interface in /domain/repositories/
3. Implement use case in /application/usecases/
4. Add controller method in /controllers/
5. Wire route in /routes/
6. Register in Container.ts
7. Write tests
8. Update frontend types + API service
```

### Frontend needs new API endpoint?

```
1. Add endpoint method in client/src/services/api.v1.ts
2. Add React Query hook in client/src/hooks/useVisitQueries.ts
3. Use hook in component
4. Update types in client/src/types/index.ts if needed
```

### Database schema change?

```
1. Create migration in server/src/migrations/
2. Update Sequelize model in server/src/models/
3. Update domain entity in server/src/domain/entities/
4. Update repository implementation
5. Run migration: npm run migrate
```

---

## Security Requirements (T-XX)

| ID      | Requirement                | Implementation                                         |
| ------- | -------------------------- | ------------------------------------------------------ |
| T-01    | Sanitize DB_ENCRYPTION_KEY | `database.ts` validates hex format before PRAGMA       |
| T-09    | Rate limiting              | `apiLimiter` middleware on all routes                  |
| T-14    | Security headers           | Helmet middleware (CSP disabled for Electron)          |
| T-JWT   | Token security             | Access (15min) + Refresh (7d) tokens, separate secrets |
| T-Enc   | Field encryption           | `Encryption.ts` utility for sensitive PII fields       |
| T-Audit | Activity logging           | All auth/visit actions logged with IP/userAgent        |

**Never:**

- Log passwords or tokens
- Return stack traces to client in production
- Use `eval()` or `new Function()`
- Disable `strict` mode in tsconfig

---

## Database Patterns

### Sequelize with SQLCipher

```typescript
// Model definition with encrypted fields
@Table
class VisitorModel extends Model {
  @Column(DataType.STRING)
  @Encrypted // Custom decorator
  declare email: string;
}

// Access decrypted value
const email = visitor.getDecrypted("email");
```

### Repository Pattern

```typescript
// Interface in domain
export interface IVisitRepository {
  findById(id: number): Promise<Visit | null>;
  create(visit: Visit): Promise<Visit>;
}

// Implementation in infrastructure
export class SequelizeVisitRepository implements IVisitRepository {
  async findById(id: number): Promise<Visit | null> {
    const model = await VisitModel.findByPk(id);
    return model ? this.toDomain(model) : null;
  }
}
```

### Migrations (Umzug)

- SQL migrations: `src/migrations/XXX-description.sql`
- Run: `npm run migrate`
- Never use `DB_SYNC_ALTER=1` in production

---

## Testing Guidelines

### Server Tests

```bash
npm run test:server    # Unit + integration
# Config: server/vitest.config.ts
```

- Use `supertest` for HTTP integration tests
- Mock external services
- Test use cases in isolation
- Database: use separate test DB or mock Sequelize

### Client Tests

```bash
npm run test:client    # Component + unit tests
# Config: client/vitest.config.ts (jsdom environment)
```

- Stub Lucide icons for faster tests
- Test hooks with `renderHook` from `@testing-library/react`
- Mock API calls with MSW or direct mocks

### Required Coverage

- Use cases: 90%+
- Repositories: 70%+
- Controllers: 60%+
- Components: 50%+

---

## Scripts Reference

```bash
# Development
npm run dev              # Concurrent client (5173) + server (3000)
npm run electron:dev     # Electron with HMR

# Quality
npm run test             # Full test suite (server + client)
npm run release          # Test → Build → Package (USE THIS FOR DISTRIBUTION)

# Individual
npm run test:server      # Backend tests only
npm run test:client      # Frontend tests only
npm run dist             # Build without tests (CI/CD use)
npm run build:server     # Compile server TypeScript
```

---

## Cascade Agent Rules

### DO

- Use `code_search` first when exploring unfamiliar code
- Prefer `multi_edit` for multiple changes in one file
- Run `npm run test` before marking tasks complete
- Use absolute paths in citations: `@/file.ts:10-15`
- Set `cwd` in `run_command`, never use `cd` in commands

### DON'T

- Create new documentation files unless explicitly requested
- Skip tests for "quick fixes"
- Use relative imports across major directory boundaries
- Add `console.log` in production code (use `logger.ts`)
- Break Clean Architecture flow (business logic stays in use cases)

### Before Committing

```bash
npm run test      # Must pass
npm run release   # Produces dist/Visitor System-*.zip
```
