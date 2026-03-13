# Package.json Scripts and Environment Loading

Choose the tier that matches your Node version for environment variable loading and dev scripts.

## Tier A: Fully non-experimental (Node >=24.10.0) — recommended

Both `--env-file` and `--env-file-if-exists` are **no longer experimental** from v24.10.0. No warnings, no caveats.

For JavaScript:
- `dev`: `node --watch --env-file-if-exists=.env src/app/server.js`
- `start`: `node --env-file-if-exists=.env src/app/server.js`

For TypeScript (compile-to-dist):
- `dev:tsc`: `tsc -w` (run in terminal 1)
- `dev`: `node --watch --env-file-if-exists=.env dist/app/server.js` (run in terminal 2)
- `build`: `tsc -p tsconfig.json`
- `start`: `node --env-file-if-exists=.env dist/app/server.js`

---

## Tier B: Experimental env flags (Node 22.9.0 – 24.9.x)

Same commands as Tier A. The env flags work correctly but are still labeled **experimental** in these versions — Node may print a warning to stderr. This is cosmetic; the functionality is stable in practice.

For JavaScript:
- `dev`: `node --watch --env-file-if-exists=.env src/app/server.js`
- `start`: `node --env-file-if-exists=.env src/app/server.js`

For TypeScript (compile-to-dist):
- `dev:tsc`: `tsc -w` (run in terminal 1)
- `dev`: `node --watch --env-file-if-exists=.env dist/app/server.js` (run in terminal 2)
- `build`: `tsc -p tsconfig.json`
- `start`: `node --env-file-if-exists=.env dist/app/server.js`

Note: on Node 22.x / early 24.x, `process.loadEnvFile()` is also experimental (until v24.10.0). If the goal is **zero experimental warnings**, require Node >=24.10.0 (Tier A).

---

## Tier C: Programmatic loading (Node 20.12+) — no CLI flags needed

For projects on Node 20.x (or if you prefer to keep env loading out of CLI flags), load the `.env` file programmatically at the top of your config module. Note: `process.loadEnvFile()` is also experimental until v24.10.0, but this approach avoids needing CLI flags entirely:

```js
// src/config/env.(js|ts) — add at the very top, before any env validation
try {
  process.loadEnvFile('.env');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  // .env not found — acceptable in production where vars are injected externally
}
```

Note: `process.loadEnvFile()` loads key-value pairs into `process.env` but does **not** apply `NODE_OPTIONS` from the file (unlike the `--env-file` CLI flag). For most backends this is fine.

Scripts become simpler (no env flags):

For JavaScript:
- `dev`: `node --watch src/app/server.js`
- `start`: `node src/app/server.js`

For TypeScript (compile-to-dist):
- `dev:tsc`: `tsc -w` (run in terminal 1)
- `dev`: `node --watch dist/app/server.js` (run in terminal 2)
- `build`: `tsc -p tsconfig.json`
- `start`: `node dist/app/server.js`

---

## Optional: Node-native TypeScript (Node >=22.18.0)

Type stripping is enabled by default since v22.18.0 (no flags needed for erasable TS syntax). You can skip the compile step:
- `dev`: `node --watch --env-file-if-exists=.env src/app/server.ts`
- `start`: `node --env-file-if-exists=.env src/app/server.ts`

For **non-erasable syntax** (`enum`, `namespace`, parameter properties), add `--experimental-transform-types`. To disable type stripping entirely, use `--no-strip-types`. Compile-to-dist remains the default production recommendation.

---

## Common Scripts (all tiers)

Always include: `lint`, `format`, `test`, `test:watch`, `migrate`, `seed`

IMPORTANT: Do NOT add `nodemon`, `dotenv`, or `tsx` as dependencies. All of their functionality is covered by Node.js built-in features.
