# Express Backend Starter Skill

A Claude skill that scaffolds **production-grade Node.js + Express backends** in seconds — with clean architecture, security-first defaults, and consistent patterns built in.

> Built by **Hashim** at [Sitefusion.dev](https://sitefusion.dev)

---

## What You Get

Instead of spending 30+ minutes setting up boilerplate, ask Claude to build your backend and get:

- ✅ **Clean folder structure** — Routes → Controllers → Services → Repositories
- ✅ **Security defaults** — Helmet, CORS, rate limiting, input validation, password hashing
- ✅ **Standardized patterns** — Consistent API responses, error handling, logging
- ✅ **Zero unnecessary dependencies** — Uses Node.js built-ins (`--watch`, `--env-file-if-exists`) instead of `nodemon`, `dotenv`, or `tsx`
- ✅ **Production ready** — Graceful shutdown, Docker support, 12-Factor compliance
- ✅ **Supports JS & TS** — TypeScript (default) or JavaScript, your choice

---

## Installation

### Claude.ai

1. Download this repo as a ZIP (Code → Download ZIP)
2. Open [Claude.ai](https://claude.ai) → Settings → Features → Skills
3. Click **"Add skill"** and upload the ZIP
4. Enable the skill toggle — done!

### Claude Code

Place the skill folder in your Claude Code skills directory:

You can also add this repo via:

```bash
npx skills add codewithhashim/express-backend-starter-skill
```

Or clone it manually:

```bash
git clone https://github.com/codewithhashim/express-backend-starter-skill.git
# Move to your Claude Code skills directory
```

---

## Example Usage

**Prompt:** "Create a new Express API for a task management app"

Claude will:
1. Confirm your preferences (language, database, ORM, auth strategy)
2. Scaffold the full folder structure
3. Generate all modules (routes, controllers, services, repositories, validators)
4. Set up middleware stack, error handling, logging, and health endpoints
5. Configure `package.json` scripts with Node.js built-in features

**More prompts that activate this skill:**
- "Set up an API with Node.js and PostgreSQL"
- "Scaffold a Node project for an e-commerce store"
- "Build an Express server with authentication"
- "I need a REST API boilerplate"
- "Create a backend in JavaScript with MongoDB"

---

## Skill Contents

```
express-backend-starter-skill/
├── SKILL.md              # Main skill instructions (14 steps)
└── references/
    ├── node-version-guide.md   # Node.js version compatibility table
    ├── scripts-and-env.md      # Package.json scripts for all Node tiers
    └── troubleshooting.md      # Common anti-patterns and fixes
```

---

## Defaults

When the user doesn't specify preferences, the skill defaults to:

| Setting | Default |
|---|---|
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT |
| Node Version | 24 LTS (≥24.10.0) |

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

## Author

**Hashim** — [Sitefusion.dev](https://sitefusion.dev) · [GitHub](https://github.com/codewithhashim)
