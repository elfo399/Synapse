#!/usr/bin/env bash
# Install this reviewed script as ~/services/synapse/deploy.sh on the Docker host.
# A dedicated authorized_keys entry forces every Jenkins SSH connection here.
set -Eeuo pipefail
umask 077

service_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command_text="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ ! "$command_text" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  printf '%s\n' 'Only deploy followed by a full Git commit is accepted.' >&2
  exit 2
fi
commit="${BASH_REMATCH[1]}"
exec 9>"$service_root/deploy.lock"
flock -n 9 || { printf '%s\n' 'Another deployment is running.' >&2; exit 1; }
test -s "$service_root/.env"
test -s "$service_root/compose.override.yaml"

repository="$service_root/repository"
if [[ ! -d "$repository/.git" ]]; then
  test ! -e "$repository"
  git clone --no-checkout --single-branch --branch main https://github.com/elfo399/Synapse.git "$repository"
fi
[[ "$(git -C "$repository" remote get-url origin)" == 'https://github.com/elfo399/Synapse.git' ]]
git -C "$repository" fetch --prune origin main
git -C "$repository" cat-file -e "$commit^{commit}"
git -C "$repository" merge-base --is-ancestor "$commit" origin/main || { printf '%s\n' 'Commit is not on origin/main.' >&2; exit 1; }

# Each commit has an immutable build context. Runtime secrets and volumes stay
# outside it, and no git reset/clean touches an operator's working directory.
release="$service_root/releases/$commit"
mkdir -p -- "$service_root/releases" "$service_root/backups"
if [[ ! -d "$release" ]]; then
  staging="$(mktemp -d "$service_root/releases/.staging-XXXXXX")"
  git -C "$repository" archive "$commit" | tar -x -C "$staging"
  mv -T --no-clobber -- "$staging" "$release"
fi
cd -- "$release"
export COMPOSE_PROJECT_NAME=synapse
export COMPOSE_FILE="$release/compose.yaml:$service_root/compose.override.yaml"
export COMPOSE_ENV_FILES="$service_root/.env"
export SYNAPSE_IMAGE_TAG="$commit"
export BACKUP_DIR="$service_root/backups"

docker compose config --quiet
printf 'Building Synapse commit %s on %s.\n' "$commit" "$(uname -m)"
docker compose build secondbrain-web

# Build first: a compilation failure leaves the live service untouched.
existing_database="$(docker compose ps -a -q secondbrain-db)"
if [[ -n "$existing_database" ]]; then
  docker compose up -d --wait secondbrain-db
  safety_backup="$(bash scripts/backup.sh "$BACKUP_DIR")"
  printf 'Pre-update backup: %s\n' "$safety_backup"
else
  printf '%s\n' 'First installation: creating empty persistent volumes.'
fi

# up recreates containers while preserving named volumes. Never down -v/prune.
docker compose up -d --wait --wait-timeout 180
docker compose exec -T secondbrain-web node -e \
  'fetch("http://127.0.0.1:3000/api/health").then(r=>{if(!r.ok)process.exit(1);console.log("Synapse health: OK")}).catch(()=>process.exit(1))'
printf '%s\n' "$commit" > "$service_root/deployed-commit"
printf '%s\n' "$release" > "$service_root/current-release"
printf 'Deployment completed: %s\n' "$commit"
