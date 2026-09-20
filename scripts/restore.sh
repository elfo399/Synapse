#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  printf '%s\n' 'Usage: bash scripts/restore.sh /absolute/path/backup.dump --confirm-replace' >&2
  printf '%s\n' 'Replaces this Compose database. Verifies checksum, stops the app, and makes a safety backup first.' >&2
}

if [[ "$#" -ne 2 || "${2:-}" != '--confirm-replace' ]]; then
  usage
  exit 2
fi

input_archive="$1"
if [[ ! -f "$input_archive" || ! -f "$input_archive.sha256" ]]; then
  printf '%s\n' 'An existing backup and matching .sha256 sidecar are required.' >&2
  exit 1
fi
archive_dir="$(cd -- "$(dirname -- "$input_archive")" && pwd)"
archive="$archive_dir/$(basename -- "$input_archive")"
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
command -v sha256sum >/dev/null || { printf '%s\n' 'sha256sum is required.' >&2; exit 1; }

# Only compare the digest of this explicitly selected file. Do not follow paths
# supplied by a modified checksum sidecar.
expected="$(awk 'NR == 1 { print $1 }' "$archive.sha256")"
actual="$(sha256sum -- "$archive")"
actual="${actual%% *}"
if [[ ! "$expected" =~ ^[a-fA-F0-9]{64}$ || "${expected,,}" != "$actual" ]]; then
  printf '%s\n' 'Checksum verification failed; database unchanged.' >&2
  exit 1
fi
docker compose exec -T secondbrain-db pg_restore --list < "$archive" > /dev/null
printf 'Restoring explicitly selected backup: %s\n' "$archive" >&2
printf '%s\n' 'Stopping the web application to prevent writes.' >&2
docker compose stop secondbrain-web

restore_failed() {
  printf '%s\n' 'Restore failed. The web application remains stopped. Inspect the error before restarting it.' >&2
  printf '%s\n' 'The transactional restore rolls back database changes on an error.' >&2
}
trap restore_failed ERR
safety_archive="$(bash "$repo_dir/scripts/backup.sh")"
printf 'Pre-restore safety backup: %s\n' "$safety_archive" >&2

docker compose exec -T secondbrain-db sh -eu -c \
  'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error' < "$archive"
trap - ERR
printf '%s\n' 'Restore completed. Starting the application and applying any newer migrations.' >&2
docker compose up -d --wait secondbrain-web
printf '%s\n' 'Restore verified: application and database are healthy.'
