#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-common.sh"

require_restic
load_backup_env

project_root="$(resolve_project_root)"
cd "$project_root"

if [[ ! -d data ]]; then
  echo "Expected data directory at $project_root/data" >&2
  exit 1
fi

echo "Backing up $project_root/data to $RESTIC_REPOSITORY"
restic backup data --exclude "data/temp" --tag enjoy-journal "$@"
