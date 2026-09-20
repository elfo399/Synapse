# Backup, recovery, and upgrades

## What a backup contains

V1 persists Items, tags, relations, wikilink references, users, password hashes, sessions, authentication rate limits, and migration history in PostgreSQL. There are no uploaded attachments. Back up the database and separately retain your deployment configuration/secrets in a password manager or encrypted storage. Future file attachments will require a second, coordinated file-store backup.

The scripts use the PostgreSQL 17 utilities already installed in the database container. `pg_dump` creates a transactionally consistent custom-format archive while the app runs. The script uses restrictive file permissions, unique UTC timestamps, an archive-readability check, and a SHA-256 sidecar. It fails on command errors and removes incomplete temporary files. See the upstream [pg_dump documentation](https://www.postgresql.org/docs/17/app-pgdump.html).

```bash
bash scripts/backup.sh
```

Output lives in `backups/` by default. Pass a destination argument or set `BACKUP_DIR`. Copy both `.dump` and `.dump.sha256` together. The checksum detects transfer corruption; it is not authentication against an attacker who can replace both files. Encrypt off-device copies. Password hashes and private notes make these archives sensitive.

Example daily Linux cron entry (replace the checkout path):

```cron
15 2 * * * cd /srv/secondbrain && /bin/bash scripts/backup.sh /mnt/backups/secondbrain >> /var/log/secondbrain-backup.log 2>&1
```

Use a scheduled job account with access to Docker and the backup directory. Monitor nonzero exit status and disk capacity. Keep, for example, 30 daily copies and 12 monthly copies, plus a recent off-device copy. Retention deletion is deliberately not automatic in the script; apply a reviewed retention policy in your backup system. A backup is useful only after a successful restore drill.

## Restore

Only restore archives made by a trusted source: PostgreSQL archives contain SQL that executes during restore. Select one archive explicitly and keep its original sidecar filename.

```bash
bash scripts/restore.sh /mnt/backups/secondbrain/secondbrain-YYYYMMDDTHHMMSSZ-RANDOM.dump --confirm-replace
```

Before changing the database, the script verifies the checksum and parses the archive. It stops `secondbrain-web`, creates a current safety backup, then runs `pg_restore --clean --if-exists --single-transaction --exit-on-error`. If restore fails, PostgreSQL rolls back the restore transaction and the web service stays stopped for inspection. On success, the script starts web with `--wait`; the startup process applies migrations newer than the backup. The safe default is to restore with the matching application version, verify, and then upgrade.

The confirmation flag is required even in automation. Never add it to a job that picks “the latest file” implicitly. Do not restore into a production stack merely to test a backup.

The restore replaces objects represented in the archive. For recovery across application schema versions, restore into a **fresh volume** with the matching application release; `--clean` does not promise to remove unrelated objects that were never in the backup. Retain the original volume until the recovery has been checked.

## Isolated recovery drill

Use a second checkout or explicit Compose project, unique web port, and new volume. Copy `.env` securely into that checkout, preserving the original `BETTER_AUTH_SECRET` if you want existing sessions to remain valid. Prefer rotating sessions after an actual incident. Do not reuse production database storage.

```bash
export COMPOSE_PROJECT_NAME=secondbrain-restore-drill
export WEB_PORT=3100
export BETTER_AUTH_URL=http://localhost:3100
docker compose up -d --build --wait
bash scripts/restore.sh /absolute/path/selected.dump --confirm-replace
```

Open `http://localhost:3100`. Check item/tag counts, several note bodies, a wikilink/backlink pair, a search result, and graph connections. Save the drill date and result. Shut down only the drill project with `docker compose down`. The explicit project name isolates its volume and services; verify it before any later volume cleanup.

To back up the development stack, set `COMPOSE_FILE=compose.dev.yaml` before running `backup.sh`. The restore script expects the production two-service topology; use an isolated production Compose project for drills.

## Upgrade

1. Record the running commit and image ID (`git rev-parse HEAD`, `docker image inspect secondbrain:local --format '{{.Id}}'`).
2. Make and copy off-device a verified backup.
3. Read the release/migration notes. Stop if a migration needs a separate manual data conversion.
4. Update the checkout and run `docker compose up -d --build --wait`.
5. Review logs, sign in, capture a temporary note, check search/graph, and archive/delete the test note.

Do not run `migrate dev`, `migrate reset`, or `db push` against production. Keep the PostgreSQL major version unchanged during routine app upgrades. A PostgreSQL major upgrade needs its own dump/restore or `pg_upgrade` plan; changing the Docker tag while reusing its old data directory is insufficient.

Rollback is an application **and schema** decision. If the new migration is compatible, run the previous image. Otherwise use the previous release with a restored pre-upgrade backup in a fresh volume. Reverting source alone cannot undo database changes.

## Passwords and sessions

The initial-account variables create an account once; changing them never resets existing credentials. V1 intentionally has no email service or self-service email reset. Keep the account password in a password manager. Use the authenticated password-change endpoint supported by Better Auth if adding account settings; do not edit a stored hash by hand. Administrative recovery requires an explicit maintenance procedure using Better Auth's password hashing API, a verified account identity, and session revocation.

Rotating `BETTER_AUTH_SECRET` invalidates existing signed sessions. Update the secret in the deployment configuration and recreate web. Changing `.env` alone does not change an already running container. Database password rotation must update the database role and the app's connection configuration together.
