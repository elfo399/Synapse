#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# COMPOSE_FILE/COMPOSE_PROJECT_NAME are honored by Docker Compose, allowing this
# script to operate on the development stack or an isolated restore drill.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
backup_dir="${1:-${BACKUP_DIR:-$repo_dir/backups}}"
mkdir -p -- "$backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd)"

command -v docker >/dev/null || { printf '%s\n' 'Docker is required.' >&2; exit 1; }
command -v sha256sum >/dev/null || { printf '%s\n' 'sha256sum is required (Linux/WSL/Git Bash).' >&2; exit 1; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$(mktemp "$backup_dir/secondbrain-$timestamp-XXXXXX.partial")"
archive="${partial%.partial}.dump"
checksum_partial="$archive.sha256.partial"
trap 'rm -f -- "$partial" "$checksum_partial"' EXIT

printf '%s\n' 'Creating consistent PostgreSQL custom-format backup...' >&2
docker compose exec -T secondbrain-db sh -eu -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$partial"
test -s "$partial" || { printf '%s\n' 'Backup is empty.' >&2; exit 1; }
docker compose exec -T secondbrain-db pg_restore --list < "$partial" > /dev/null
# Hard-link creation is atomic and refuses to overwrite an existing backup.
ln -- "$partial" "$archive"
(
  cd -- "$backup_dir"
  sha256sum -- "$(basename -- "$archive")"
) > "$checksum_partial"
mv -- "$checksum_partial" "$archive.sha256"
printf 'Backup verified and saved: %s\n' "$archive" >&2
printf '%s\n' "$archive"
