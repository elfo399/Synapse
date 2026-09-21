# Backup, recovery, and upgrades

## What a backup contains

Synapse stores notes, tags, relations, accounts and attachment metadata in PostgreSQL. Private file bytes live in a separate named volume. Both must be backed up together. Keep deployment configuration and secrets separately in encrypted storage.

```bash
bash scripts/backup.sh
```

The script briefly stops the web service, takes a PostgreSQL custom-format dump and exports every referenced attachment with its size and SHA-256. It checks that pg_restore can read the dump and verifies file hashes while exporting. If a referenced file is missing or corrupt, the backup fails. The web service restarts on success or failure if it was running beforehand. Schedule the short interruption when appropriate; do not run multiple backup/restore jobs concurrently.

A uniquely named UTC directory in backups/ contains database.dump, attachments.pack, manifest.json (format 2), and SHA256SUMS. Publication refuses overwrites. Pass a destination directory or set BACKUP_DIR. Copy the entire directory, encrypt off-device copies, and monitor disk capacity. Checksums detect corruption, not replacement by someone who can modify both data and checksums. Retention is left to the operator.

The pack uses bounded JSON headers and exact-length binary records, with opaque hexadecimal keys only. Restore does not extract arbitrary archive paths. The helper runs as the same non-root user as the application and supports the same ARM64 Node image.

## Restore

Only use a trusted backup: PostgreSQL archives contain executable SQL. Select the directory explicitly:

```bash
bash scripts/restore.sh /absolute/path/synapse-YYYYMMDDTHHMMSSZ-RANDOM --confirm-replace
```

Restore verifies the fixed backup filenames and checksums before changing anything. It stops web, creates a current safety backup, validates the attachment pack into a separate staging directory, swaps the object directory, and restores PostgreSQL in one transaction. It then verifies every database-referenced file against its size and hash. Failure rolls back the file swap; failure after database commit restores the safety database too. The app stays stopped after failure so an operator can inspect the outcome and the printed safety-backup path. After verification, obsolete staged storage is removed and web restarts with a health check.

Database-only .dump backups from V1 are not accepted by the combined restore script. Restore them using the previous release in an isolated fresh database, verify the data, then upgrade; do not pair an old dump with arbitrary current attachment storage. Across schema versions use a fresh volume and the matching release before upgrading: pg_restore --clean cannot remove objects absent from an older dump.

## Isolated recovery drill

Use a separate Compose project, port, and fresh volumes. Never test replacement against the live workspace.

```bash
export COMPOSE_PROJECT_NAME=synapse-restore-drill
export WEB_PORT=3100
export BETTER_AUTH_URL=http://localhost:3100
docker compose up -d --build --wait
bash scripts/backup.sh /absolute/path/drill-backups
# Make a controlled change, then select the backup explicitly:
bash scripts/restore.sh /absolute/path/drill-backups/synapse-TIMESTAMP-RANDOM --confirm-replace
```

Verify note contents, authentication, wikilinks, relations and search, plus byte-for-byte image/audio/document downloads. Restart/recreate web and confirm files persist. Use docker compose down for the explicitly named drill project when finished; retain its backup for inspection. The scripts require the two-service production Compose topology and Bash, Docker Compose and sha256sum (Linux, WSL or Git Bash).

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
