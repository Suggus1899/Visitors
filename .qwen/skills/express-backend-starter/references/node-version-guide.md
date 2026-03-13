# Node Version Guide

## Feature Version Table

| Feature | Minimum Version | Stability | Notes |
|---|---|---|---|
| `node --watch` | **>=20.13.0** | Stable | Built-in file watcher for dev auto-restarts (replaces `nodemon`) |
| `--env-file` | **>=20.6.0** | Experimental until **v24.10.0** | Loads `.env` files natively (replaces `dotenv`). Crashes if file is missing. |
| `--env-file-if-exists` | **>=22.9.0** | Experimental until **v24.10.0** | Same as `--env-file` but silently skips if file is absent. Ideal for dev/prod parity. |
| `process.loadEnvFile()` | **>=20.12.0** | Experimental until **v24.10.0** | Programmatic `.env` loading (wrap in try/catch for optional use). |
| Native TS execution | **>=22.18.0** | Stable since **v25.2.0** | Type stripping enabled by default since v22.18.0/v23.6.0; reached Stable in v25.2.0. |

## Recommended Baseline

**Node 24 LTS (Active LTS).** Pin **Node >=24.10.0** when relying on env-file features being non-experimental. This gives you fully stable `--watch`, `--env-file-if-exists`, and `process.loadEnvFile()` — all without experimental flags.

On Node 22.x or Node 24.0–24.9.x, both `--env-file*` CLI flags and `process.loadEnvFile()` are still labeled experimental and may emit warnings. The functionality works correctly, but if the goal is **zero experimental warnings**, require **Node >=24.10.0**.

## Node Lifecycle (as of Feb 2026)

- **Node 24** — Active LTS. Recommended for all new projects.
- **Node 22** — Maintenance LTS. Fine for existing projects; all features in this skill work (env flags are experimental but functional).
- **Node 20** — Maintenance LTS, **EOL 2026-04-30**. Discouraged for new projects. If you must use it, use `process.loadEnvFile()` for env loading (see scripts-and-env.md, Tier C).

Pin the Node version in `.nvmrc` (or `.tool-versions`) — e.g. `24` or a specific `24.x.y`.

## Watch Mode Flags

- **`--watch`** — Stable since v20.13.0. Cross-platform file watcher for dev auto-restarts.
- **`--watch-path`** — Scopes watched directories but is only supported on macOS and Windows — it throws an error on unsupported platforms (e.g. Linux). Do not rely on it as a requirement.
- **`--watch-preserve-output`** (stable) — Preserves terminal output between restarts instead of clearing the screen.
- **`--watch-kill-signal`** — In active development. Allows customizing the signal sent to the child process on restart.

## Native TypeScript

Type stripping is enabled by default since v22.18.0 / v23.6.0, but the feature reached **Stable** in **v25.2.0** (a Current release, not LTS). By default, Node strips type annotations and runs the resulting JavaScript — this works for erasable TypeScript syntax. This is an optional/advanced approach; compile-to-dist remains the default production recommendation.

- **`--no-strip-types`** — Disable type stripping entirely.
- **`--experimental-transform-types`** — Support non-erasable syntax (e.g. `enum`, `namespace`, parameter properties).

Compile-to-dist remains the default production recommendation.

## `process.loadEnvFile()` vs `--env-file`

Both load key-value pairs from `.env` into `process.env`, but `--env-file` (CLI flag) also applies `NODE_OPTIONS` found in the file, while `process.loadEnvFile()` does not. For most backends this distinction is irrelevant, but be aware if your `.env` sets `NODE_OPTIONS`.
