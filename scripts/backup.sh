#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
backup_dir="${1:-${BACKUP_DIR:-$repo_dir/backups}}"
mkdir -p -- "$backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd)"
command -v docker >/dev/null
command -v sha256sum >/dev/null
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$(mktemp -d "$backup_dir/.synapse-$timestamp-XXXXXX.partial")"
archive="$backup_dir/$(basename -- "${partial%.partial}" | sed 's/^\.//')"
was_running="$(docker compose ps --status running --services secondbrain-web)"
cleanup() {
  local code=$?
  # This directory was created by mktemp above, never supplied as a deletion target.
  rm -rf -- "$partial"
  if [[ -n "$was_running" ]]; then docker compose start secondbrain-web >&2 || code=1; fi
  exit "$code"
}
trap cleanup EXIT
if [[ -n "$was_running" ]]; then docker compose stop secondbrain-web >&2; fi
printf '%s\n' 'Backing up database and private attachments with the app stopped.' >&2
docker compose exec -T secondbrain-db sh -eu -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$partial/database.dump"
test -s "$partial/database.dump"
docker compose exec -T secondbrain-db pg_restore --list < "$partial/database.dump" > /dev/null
docker compose run --rm --no-deps -T --entrypoint node secondbrain-web scripts/attachment-backup.mjs export > "$partial/attachments.pack"
printf '{"format":2,"createdAt":"%s","database":"database.dump","attachments":"attachments.pack"}\n' "$timestamp" > "$partial/manifest.json"
(cd -- "$partial" && sha256sum database.dump attachments.pack manifest.json) > "$partial/SHA256SUMS"
mv -T --no-clobber -- "$partial" "$archive"
test ! -d "$partial" || { printf '%s\n' 'Backup name already exists; no file overwritten.' >&2; exit 1; }
printf 'Verified backup saved: %s\n' "$archive" >&2
printf '%s\n' "$archive"
