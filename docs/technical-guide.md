# Guida tecnica di Synapse

[Torna alla presentazione di Synapse](../README.md)

A private, self-hosted workspace for capturing ideas, processing an inbox, organizing with PARA, and finding connections in your knowledge. Designed for a Raspberry Pi 5 with 16 GB RAM and a 64-bit Linux OS.

Capture → Inbox → Process → Organize → Connect → Retrieve.

## Features

- Fast desktop/mobile capture, inbox processing, dashboard, and recent items.
- Notes, tasks, projects, areas, resources, and bookmarks share a linked Item model.
- Markdown editor and sanitized preview, `[[wikilinks]]`, outgoing relations, and backlinks.
- Relational tags, lightweight task states/due dates, project/area/resource assignment.
- PostgreSQL full-text search and a keyboard command palette (`Ctrl/Cmd + K`).
- Interactive 3D knowledge graph with rotation, zoom, filters, selection, connection details, and local neighborhoods; optional 2D view and automatic fallback when WebGL is unavailable.
- Archive/restore and explicit permanent-deletion confirmation.
- Private login, closed registration, owner-scoped queries, and secure production cookies.
- Responsive dark interface and installable PWA; captures require a live connection.
- Docker Compose, migrations, initial-account bootstrap, native PostgreSQL backup/restore, and CI.

## Screenshots

The desktop dashboard, knowledge graph, and mobile capture are the primary review surfaces. Run the browser suite to produce failure screenshots/traces in `test-results/`; screenshots from the implementation smoke test are documented in [verification](verification.md) when captured. No stock UI mockups are presented as application screenshots.

## Stack and architecture

| Component                       | Pinned version                                                   |
| ------------------------------- | ---------------------------------------------------------------- |
| Node.js                         | 22.23.2 (Docker and CI)                                          |
| Next.js / React                 | 16.3.5 / 19.3.0                                                  |
| PostgreSQL                      | 17 (`postgres:17-bookworm`; latest security patch in this major) |
| Prisma                          | 6.19.3                                                           |
| Better Auth                     | 1.7.5                                                            |
| Tailwind CSS                    | 4.3.3                                                            |
| react-force-graph-3d / Three.js | 1.29.1 / 0.186.0                                                 |
| Cytoscape.js (2D view)          | 3.34.3                                                           |
| Vitest / Playwright             | 4.1.11 / 1.63.0                                                  |

The committed `package-lock.json` is authoritative for exact JavaScript dependencies. This is a modular monolith: Next.js handles the UI and HTTP boundary, services contain use cases, Prisma persists data, and PostgreSQL handles search. Only two production services are required. Read [ARCHITECTURE.md](../ARCHITECTURE.md), the [graph design](graph.md), and [security notes](security.md).

The graph opens in 3D. Drag to rotate, right-drag to pan, and use the wheel to zoom; touch supports rotation, pinch zoom, and two-finger pan. With the graph stage focused, arrow keys rotate/tilt, `+` and `-` zoom, and `0` fits the graph. Visible controls provide rotate, tilt, zoom, fit, and reset actions. The **2D** button opens the Cytoscape view, which is also used automatically when WebGL is unavailable. Both views retain the same filters, selected-item details, links, and keyboard-accessible item list. See [graph controls and limits](graph.md).

```text
src/app/            Routes, layouts, HTTP API
src/components/     Shared shell and accessible UI primitives
src/features/       Item, search, editor, and graph UI
src/domain/         Types, validation, normalization, wikilink parsing
src/server/         Authorized application services and error handling
src/lib/            Prisma and Better Auth setup
prisma/             Schema and committed SQL migrations
scripts/            Account bootstrap, demo seed, backup, restore, startup
tests/              Unit, database integration, and browser workflows
docs/               Deployment, operations, graph, security, verification
```

## Requirements

- Node.js 22.23.2 and npm for local development; Docker Engine/Desktop with Compose v2 for PostgreSQL.
- Docker Engine with Compose v2 for production; `docker compose up --wait` must be supported.
- Linux Bash, `sha256sum`, and Docker CLI for backup/restore; use WSL or Git Bash on Windows.
- HTTPS for production access outside localhost. Tailscale Serve is the recommended private TLS endpoint.

## Development

```bash
git clone <your-repository-url> secondbrain
cd secondbrain
cp .env.example .env
```

Edit `.env`: set a unique database password, a separate random authentication secret, an initial email/password, and the matching local `DATABASE_URL`. The initial password must have at least 12 characters. Generate each secret independently with `openssl rand -hex 32` (or a password manager). Keep `BETTER_AUTH_URL=http://localhost:3000` for local development.

```bash
docker compose -f compose.dev.yaml up -d --wait
npm ci
npm run db:generate
npm run db:migrate:prod
npm run db:bootstrap
npm run db:seed
npm run dev
```

Visit `http://localhost:3000` and sign in with the initial account. `db:seed` is optional, idempotent demo content and is deliberately disabled in production. Startup does not change an existing account's password. Remove `INITIAL_ADMIN_PASSWORD` from `.env` after bootstrap; keep it in your password manager.

The development Compose file is a separate database stack and volume. Do not merge it with the production file. It publishes PostgreSQL only on `127.0.0.1:5432`. Stop it with `docker compose -f compose.dev.yaml down`; omit `--volumes` to preserve data.

### Database changes

```bash
npm run db:migrate -- --name describe_change
npm run db:validate
npm run db:studio
```

Commit every generated migration and review its SQL. Use `db:migrate:prod` (`prisma migrate deploy`) on deployed systems; never use `migrate reset` against live data. Search indexes/triggers and database ownership constraints live in the SQL migration as well as the Prisma model. Back up before deploying schema changes.

## Environment variables

| Variable                                         | Purpose                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Local app/Prisma PostgreSQL connection string; Compose supplies its own internal URL.  |
| `POSTGRES_DB` / `POSTGRES_USER`                  | Database and role names; both default to `secondbrain`. Use simple alphanumeric names. |
| `POSTGRES_PASSWORD`                              | Required database secret. Hex is recommended so it is URL-safe in Compose.             |
| `POSTGRES_PORT`                                  | Local development DB port; default `5432`. Production publishes no DB port.            |
| `BETTER_AUTH_SECRET`                             | Required random session/authentication secret, at least 32 characters.                 |
| `BETTER_AUTH_URL`                                | Exact external origin, including HTTPS scheme; no wildcard origins.                    |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Required only when creating the first account; no default credentials.                 |
| `INITIAL_ADMIN_NAME`                             | Initial display name; defaults to `My Synapse`.                                        |
| `WEB_BIND_ADDRESS` / `WEB_PORT`                  | Host web binding; default `127.0.0.1:3000`.                                            |
| `BACKUP_DIR`                                     | Optional backup destination used by the Bash scripts; default `./backups`.             |
| `COMPOSE_FILE` / `COMPOSE_PROJECT_NAME`          | Standard Compose overrides, also honored by backup/restore.                            |
| `TEST_DATABASE_URL`                              | Dedicated PostgreSQL database for integration tests; never point tests at production.  |

Keep `.env` private (`chmod 600 .env` on Linux). It is excluded from Git and Docker build context. For passwords containing reserved URL characters, percent-encode them in local connection URLs; the supplied Compose URL expects a URL-safe database password. Dollar signs in Compose `.env` values require single-quoted values to avoid interpolation.

## Testing and quality gates

Integration and E2E tests require a disposable PostgreSQL database with the migrations applied. Set the test connection in your shell/CI before running them. Browser tests use the configured initial-account credentials.

```bash
npm run format:check
npm run lint
npm run typecheck
npm run db:validate
npm run test:unit
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
docker build -t secondbrain:local .
```

CI runs installation, schema validation/migrations, lint, typecheck, unit/integration tests, production build, browser tests, and a separate Docker build. See [verification](verification.md) for the actual local results and limitations; a documented command is not a claim that it passed.

## Production with Docker

Configure `.env` as above, then:

```bash
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail=100 secondbrain-web
```

Startup waits for PostgreSQL health, deploys committed migrations, creates the initial account if needed, then serves the standalone Next.js application. `/api/health` checks app/database readiness without exposing private data. The web container runs as UID 1001. Application builds require no real database or deployment secrets.

Visit `http://localhost:3000` on the host for an initial check. Configure Tailscale HTTPS before accessing from other devices. Production rejects non-HTTPS external auth origins. The app has no dependency on Tailscale inside its containers.

See the [Raspberry Pi and Tailscale deployment guide](deployment.md) for storage, LAN access, TLS, upgrades, and troubleshooting.

## Backup, restore, and upgrades

```bash
bash scripts/backup.sh
bash scripts/backup.sh /mnt/backup-drive/secondbrain
```

The script briefly stops web and creates a timestamped directory containing a PostgreSQL dump, a verified private attachment pack, a manifest and SHA-256 checksums. It refuses silent overwrites. Metadata lives in PostgreSQL; file bytes live in a separate persistent volume. A Docker volume is persistence, **not a backup**. Copy encrypted backups off the Pi and perform regular restore drills.

To restore an explicitly selected, trusted archive into the current Compose stack:

```bash
bash scripts/restore.sh /absolute/path/synapse-TIMESTAMP-RANDOM --confirm-replace
```

Restore verifies the checksum, stops web writes, creates a safety backup, restores transactionally, and starts the web service with health checks. The flag deliberately confirms replacement of live data. The `.sha256` sidecar is mandatory. See [operations](operations.md) for recovery drills, retention, upgrade/rollback details, and failure behavior.

Before an upgrade, run a backup and note the current commit/image. Then update the checkout and run `docker compose up -d --build --wait`. Inspect logs and verify login, search, and graph. Never use `docker compose down --volumes` during routine upgrades.

## Security and limitations

Public registration is disabled. Every private read and write uses the authenticated owner's ID; relations/tags also enforce owner consistency in PostgreSQL. Better Auth handles password hashing and sessions. Markdown rendering strips unsafe content, bookmarks permit only HTTP(S), mutations check origin and validate input, and search SQL is parameterized. Production cookies require HTTPS outside localhost. See [the security review](security.md) for boundaries and operational responsibilities.

V1 is a personal workspace: no collaboration, AI, semantic search, email recovery, notifications, or offline write synchronization. The graph is intentionally bounded (500 nodes by default, 1,500 maximum; 5,000 edges). Item titles are unique per owner after normalization to keep wikilinks unambiguous. Canvas graph exploration has a companion keyboard-accessible item list. PWA installation depends on browser support and HTTPS; the offline screen cannot access or edit private notes.

Future embeddings/RAG can consume authorized Items and relations; future attachments should store metadata in PostgreSQL and bytes in a separately backed-up file/object store. These extension points do not require additional infrastructure in V1.

See [Universal Capture and private attachments](capture-and-attachments.md) for upload formats, storage configuration, URL behavior and limitations.
