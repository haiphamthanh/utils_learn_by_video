#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-common.sh"

require_restic
load_backup_env

snapshot="${1:-latest}"
target_dir="${RESTORE_TARGET:-$HOME/Desktop/enjoy-journal-restored}"
mkdir -p "$target_dir"

if [[ $# -gt 0 ]]; then
  shift
fi

echo "Restoring snapshot $snapshot into $target_dir"
restic restore "$snapshot" --target "$target_dir" "$@"
