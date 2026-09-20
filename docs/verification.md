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

## Search dialog and dropdown consistency (21 September 2026)

- Fixed the search dialog's missing styles: full-width input, aligned icon, readable result cards, scrolling, spaced keyboard shortcuts, and mobile bounds. Search focus returns to its opener on dismissal.
- Replaced all 13 native select controls with a shared themed Radix Select, including filters, item properties, capture, relations, and graph controls. API values and the empty "all" filter remain unchanged.
- Corrected PostgreSQL headline options that leaked `StopSel` and HTML markers into search previews. Snippets display plain text for Markdown links, wikilinks, and common formatting.
- ESLint and TypeScript passed. All 7 Chromium E2E checks passed, including keyboard navigation, nested Escape handling, filter reset, persisted type/status changes, and mobile bounds. The 5 search/graph integration checks passed on the separate development database, including snippet regression checks for both complete and truncated wikilinks.
- Inspected desktop (1440 px) and mobile (390 px) search and open menus in lists, capture, graph, and relations. The browser sweep reported no uncaught errors. Temporary test items were removed by their fixture cleanup; the development database was stopped after verification.
- Rebuilt and restarted the final local Docker image. Both services are healthy; the final browser sweep also verified clean search snippets from the deployed API and captured 11 screenshots.

## Complete UI redesign (21 September 2026)

- Replaced the green dashboard visual system with shared charcoal/indigo tokens, a quiet shell, capture-first Home, document-oriented editing, unified collection rows, command palette, and contextual graph inspector. Scope and file map: [ui-redesign.md](ui-redesign.md).
- Inspected all 11 workspace routes before editing. Reviewed the redesigned routes at 1440 × 1000 and 390 × 844, including note editing/reading, project detail, login, search, capture, graph global/local/selection/2D, tags and archive. Final Docker browser review reported zero uncaught browser errors and no horizontal page overflow.
- Verified 12 loading/empty/error combinations across Home, lists, search and graph on mobile through browser-only response interception. Checked focus, Escape, keyboard navigation and retry, without changing application records.
- ESLint and TypeScript passed. Unit tests: **32 passed**. Integration tests: **14 passed** on the separate development database, including local graph depth 1–3, invalid depth, truncation and ownership isolation.
- Full Chromium E2E suite: **13 passed** against the isolated development preview on port 3001. Coverage includes login/logout, capture, inbox processing, editing, tags, search, real palette actions, archive/restore/delete, keyboard orbit/zoom, graph selection/filtering, 2D fallback without WebGL, fullscreen select layering, local depth, mobile navigation, preferences, long-note wikilink/backlink persistence and title resizing across desktop/mobile. Focus is also checked after switching from the mobile drawer to another dialog and closing the graph inspector. Fixture items are removed by returned IDs.
- Authentication sessions are reused per E2E worker so test volume does not trigger repeated-login throttling. The application's rate limit was not disabled or relaxed.
- Production `next build` completed successfully inside the Linux Docker image. Rebuilt `secondbrain:local` and restarted Compose; both web and PostgreSQL health checks passed. Existing production volume retained. The final production review uses existing items and does not create demo records.
- Produced 46 final screenshots under the ignored local `.tools/redesign-final/` directory, plus baseline, state and long-editor captures in `.tools/redesign/`. No screenshots depend on mocked statistics or graph content; mocked network responses are limited to the explicitly named state-review images.
- Accessibility review covered labels/roles, visible keyboard focus, nested menus, focus restoration, graph text navigation, viewport bounds and reduced-motion preference. Muted text token contrast is 4.57:1 against the lightest neutral active surface. This is not a complete automated WCAG audit or a physical mobile/GPU performance benchmark. Dense graph captions are intentionally prioritized; no native minimap or pre-existing light theme was available.

The physical Raspberry Pi, its SSD/power supply, HTTPS endpoint, tailnet access policy, real credentials, and off-device backup custody cannot be inferred from a desktop test. Validate them on the target host using [deployment](deployment.md) and [operations](operations.md).
