# Verification record

This file separates reproducible quality gates from claims of execution. The implementation handoff records the final observed results here after the complete application has been assembled.

## Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run db:validate
npm run db:migrate:prod
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
docker build -t secondbrain:local .
docker compose up -d --build --wait
bash scripts/backup.sh
bash scripts/restore.sh /absolute/path/selected.dump --confirm-replace
```

Use disposable databases/projects for integration tests and restore drills. Never execute the test suite against personal production data. CI checks AMD64 Linux; an ARM64 image should also be built and run before claiming on-device Raspberry Pi validation.

## Infrastructure checks already executed

- Bash syntax validation passed for `scripts/backup.sh` and `scripts/restore.sh`.
- Shell syntax validation passed for `scripts/docker-entrypoint.sh`.
- Local Docker Engine responded as version 29.7.2.
- Production and development Compose configuration validation passed.
- A real PostgreSQL 17 custom-format dump and checksum were created and parsed in the isolated `secondbrain-infra-check` Compose project.
- Restore rejected a deliberately corrupted archive before database changes.
- Restore rejected an invocation without an explicit archive/confirmation flag.
- Prettier validation passed for README, architecture, docs, Compose, and CI files.

## Deployment-specific checks

## Local application checks (20 September 2026)

- TypeScript validation passed.
- Unit tests: 14 passed.
- PostgreSQL integration tests: 11 passed, including item lifecycle, ownership, wikilinks, backlinks, archive, full-text search, and bounded graph queries.
- Prisma migration deployment and administrator bootstrap passed on the development PostgreSQL instance.
- Dependency audit after the scoped `deepmerge-ts` override: zero reported vulnerabilities.
- ESLint passed with no errors or warnings.
- Production Next.js build passed inside the Linux Docker image, including TypeScript validation.
- Docker image `secondbrain:local` built successfully for AMD64.
- `docker compose up -d --no-build --wait` passed; web and PostgreSQL health checks passed. Web is bound to `127.0.0.1:3000`, PostgreSQL has no published production port.
- Production migrations and first-account bootstrap succeeded automatically in the container.
- Explicitly seeded the local preview with 19 interconnected example items. Production startup does not seed automatically.
- Chromium E2E smoke: 1 passed, covering protected routes, login, capture, Inbox processing, tags, search, graph selection, archive, restore, deletion confirmation and logout.
- Local-login regression fixed: the initial deployment rejected `Origin: http://127.0.0.1:3000` while accepting `localhost`. Authentication and application mutations now share explicit loopback aliases. Rebuilt/restarted Docker and reran the complete Chromium smoke at `http://127.0.0.1:3000`: passed. Credentials were verified and unchanged. Unit suite after adding 18 origin-boundary checks: 32 passed.
- The user requested the local Docker preview before the full final release review. Full responsive/browser coverage, formatting validation of the assembled repository, a complete restore drill, ARM64 execution and physical Raspberry Pi verification remain outstanding.

## 3D graph checks (21 September 2026)

- ESLint and TypeScript validation passed; unit suite: 32 passed.
- Chromium graph checks passed for mouse orbit, keyboard rotation, zoom controls, item selection, switching between 3D and 2D, and filtering. Each test creates and removes its own isolated graph, without requiring seeded data.
- A deliberately unavailable WebGL context switched to the usable 2D renderer, including item selection.
- Rebuilt `secondbrain:local` and restarted Docker Compose successfully; web and PostgreSQL are healthy. All 3 Chromium E2E tests passed against the updated local container at `http://127.0.0.1:3000`, including the existing login/item lifecycle smoke test. The temporary development server and database were stopped afterward.
- Desktop (1440 px) and narrow (390 px) screenshots were inspected. Camera fitting and label sizing were adjusted for readability; neither viewport had horizontal page overflow. These are desktop Chromium checks, not physical mobile-device or GPU performance benchmarks.

## Synapse and Italian interface (21 September 2026)

- Renamed the visible application, browser metadata, installable-app manifest, authentication app name, offline page, and npm package to Synapse. Existing deployment identifiers and volumes remain compatible.
- Translated navigation, all screens, dialogs, graph controls, accessible labels, notifications, validation messages, and example fixtures. Display labels are independent of stable route paths and API enum values.
- Dates use Italian formatting and the Europe/Rome time zone consistently. This also fixes a server/browser hydration mismatch observed around midnight with Docker running in UTC.
- Matched all 19 local demo items against the unchanged original titles/content, backed up the existing data locally, and translated them in one transaction. Renamed 9 demo tags in place; all 35 relations were preserved.
- ESLint, TypeScript, 32 unit tests, and the Linux production image build passed. All 3 existing Chromium E2E tests passed with Italian selectors, including manifest/language checks and the detail-to-notes navigation regression.
- Inspected 11 application routes at 1440 px and 390 px, plus login, note editor, and creation dialog. Final browser sweep found no horizontal overflow or uncaught browser errors. Invalid credentials, rate limiting, and schema validation display Italian messages.
- Rebuilt and restarted the local Docker deployment; web and PostgreSQL health checks passed.

The physical Raspberry Pi, its SSD/power supply, HTTPS endpoint, tailnet access policy, real credentials, and off-device backup custody cannot be inferred from a desktop test. Validate them on the target host using [deployment](deployment.md) and [operations](operations.md).
