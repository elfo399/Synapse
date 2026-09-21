#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ] || [ -z "${BETTER_AUTH_SECRET:-}" ] || [ -z "${BETTER_AUTH_URL:-}" ]; then
  printf '%s\n' 'Synapse startup failed: DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.' >&2
  exit 1
fi

printf '%s\n' 'Synapse: applying database migrations.'
./node_modules/.bin/prisma migrate deploy
printf '%s\n' 'Synapse: checking initial account.'
./node_modules/.bin/tsx scripts/bootstrap.ts
printf '%s\n' 'Synapse: checking private storage and retrying pending deletions.'
node scripts/attachment-backup.mjs maintain
printf '%s\n' 'Synapse: starting application.'
exec "$@"
