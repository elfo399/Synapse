#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ "$#" -ne 2 || "${2:-}" != '--confirm-replace' ]]; then
  printf '%s\n' 'Usage: bash scripts/restore.sh /absolute/path/synapse-backup-directory --confirm-replace' >&2
  exit 2
fi
archive="$(cd -- "$1" && pwd)"
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_dir"
command -v sha256sum >/dev/null
# Check only fixed filenames, never follow paths found in a checksum file.
for name in database.dump attachments.pack manifest.json; do
  test -f "$archive/$name"
  expected="$(awk -v name="$name" '$2 == name { print $1 }' "$archive/SHA256SUMS")"
  actual="$(sha256sum -- "$archive/$name")"; actual="${actual%% *}"
  [[ "$expected" =~ ^[a-f0-9]{64}$ && "$expected" == "$actual" ]] || { printf 'Checksum failed: %s. No changes made.\n' "$name" >&2; exit 1; }
done
docker compose exec -T secondbrain-db pg_restore --list < "$archive/database.dump" > /dev/null
docker compose stop secondbrain-web >&2
safety_archive="$(bash "$repo_dir/scripts/backup.sh")"
printf 'Pre-restore safety backup: %s\n' "$safety_archive" >&2
token="$(docker compose run --rm --no-deps -T --entrypoint node secondbrain-web -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
[[ "$token" =~ ^[a-f0-9]{32}$ ]]
storage() { docker compose run --rm --no-deps -T --entrypoint node secondbrain-web scripts/attachment-backup.mjs "$1" "$token"; }
restore_database() {
  docker compose exec -T secondbrain-db sh -eu -c \
    'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error' < "$1"
}
activated=0
database_changed=0
failed() {
  trap - ERR
  set +e
  if [[ "$activated" == 1 ]]; then storage rollback; fi
  if [[ "$database_changed" == 1 ]]; then restore_database "$safety_archive/database.dump"; fi
  printf 'Restore failed. App remains stopped. Safety backup: %s\n' "$safety_archive" >&2
  exit 1
}
trap failed ERR
storage stage < "$archive/attachments.pack"
storage activate
activated=1
restore_database "$archive/database.dump"
database_changed=1
storage verify
trap - ERR
storage finalize
docker compose up -d --wait secondbrain-web >&2
printf '%s\n' 'Database and attachment hashes verified. Application is healthy.'
