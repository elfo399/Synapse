# Security boundaries and review

Synapse is intended for a private deployment reachable through a trusted TLS endpoint, preferably Tailscale Serve. It is not a hardened public multi-tenant SaaS. The following controls are implemented in the source and should remain regression-tested.

| Boundary               | Control                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Password storage       | Better Auth's password hashing API; bootstrap stores no plaintext password.                                               |
| Registration           | Email/password login enabled; public signup disabled; first account supplied through deployment variables.                |
| Sessions               | Better Auth database sessions, HTTP-only cookies, HTTPS secure cookies, expiry/rotation, logout invalidation.             |
| Login abuse            | Database-backed Better Auth rate limiting, with a tighter login rule.                                                     |
| Authorization          | Session required for private routes/APIs; every Item/tag/search/graph/relation query derives the owner from that session. |
| Database isolation     | Composite owner foreign keys prevent cross-owner relations and tag assignments; unique constraints prevent duplicates.    |
| CSRF                   | Canonical trusted auth origin; JSON-only app mutations check Origin and Sec-Fetch-Site; session cookie protections apply. |
| Validation             | Zod boundary schemas, bounded request body, bounded pagination/graph parameters, safe HTTP(S) bookmark URLs.              |
| SQL injection          | Prisma queries and parameterized SQL fragments for PostgreSQL full-text search.                                           |
| Markdown/XSS           | Markdown renderer with sanitization; raw HTML not trusted; safe link schemes; plain-text search snippets.                 |
| Information disclosure | Private API responses use `no-store`; health endpoint exposes readiness only; generic unexpected-error responses.         |
| Headers                | Application security headers restrict framing, content sniffing, referrer and browser capabilities.                       |
| Container              | Non-root web UID, removed Linux capabilities, no-new-privileges, rotating logs; no published production database port.    |
| Secrets                | Runtime environment only; `.env`/backups excluded from Git and build context; separate database and auth secrets.         |
| PWA                    | Service worker does not cache private APIs or notes and does not queue offline mutations.                                 |

## Operational responsibilities

Keep host OS, Docker, Tailscale, PostgreSQL patch releases, and application dependencies current. Review lockfile changes. Keep backups encrypted and test recovery. Protect access to Docker and `.env`: anyone controlling either can access the database. PostgreSQL storage encryption depends on host-disk encryption; application-level note encryption is not implemented.

Use one canonical HTTPS `BETTER_AUTH_URL` in production. Do not disable secure cookies or widen trusted origins to solve proxy problems. Bind the backend to loopback unless a deliberate LAN proxy needs access. No public port forwarding is required. Tailnet membership does not replace the application login.

Loopback deployments permit only the three explicit local aliases (`localhost`, `127.0.0.1`, `[::1]`) at the configured scheme and port. Remote deployments continue trusting only their configured origin. Authentication and JSON mutation guards share the allowlist; cross-site requests remain rejected.

The app does not intentionally log passwords, tokens, secrets, or note bodies. Review reverse-proxy logs and infrastructure logs separately. An error log intentionally captures error class/context rather than full sensitive request payloads; reproduce with controlled test data when deeper diagnostics are needed.

## Destructive actions and recovery

Archive is reversible and preserves links/search. Permanent deletion requires explicit confirmation and owner validation; cascades remove edge/join records without deleting neighbors. Restore requires an explicit file and `--confirm-replace`, validates a checksum, stops writes, takes a safety backup, and uses a single PostgreSQL transaction. Only restore trusted archives.

Bootstrap is not a password-reset tool. Remove the initial password from the running configuration after account creation. Store it in a password manager. Account recovery and credential rotation must invalidate existing sessions. V1 has no email password recovery or MFA UI.

## Review evidence and limits

Unit tests cover parsing/validation; database integration tests exercise persistence and ownership; browser tests cover private access and critical workflows. The exact executed results belong in [verification](verification.md). Code review and automated tests are not an independent penetration test. Physical Raspberry Pi runtime, the operator's TLS proxy, tailnet policy, disk encryption, and backup custody need verification on the deployment host.
