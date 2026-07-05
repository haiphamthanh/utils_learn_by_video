#!/usr/bin/env bash
set -euo pipefail

BACKUP_CONFIG_DIR="${HOME}/.config/enjoy-journal"
BACKUP_ENV_FILE="${BACKUP_CONFIG_DIR}/backup.env"
BACKUP_PASSWORD_FILE="${BACKUP_CONFIG_DIR}/restic-password"

resolve_project_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  echo "$(cd "$script_dir/.." && pwd)"
}

ensure_config_dir() {
  mkdir -p "$BACKUP_CONFIG_DIR"
}

require_restic() {
  if command -v restic >/dev/null 2>&1; then
    return
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    echo "Restic not found. Installing via Homebrew..."
    brew install restic
    return
  fi

  echo "Restic is not installed. Install it first with: brew install restic" >&2
  exit 1
}

load_backup_env() {
  ensure_config_dir

  if [[ ! -f "$BACKUP_ENV_FILE" ]]; then
    echo "Backup config not found at $BACKUP_ENV_FILE" >&2
    echo "Run: yarn backup:setup" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"

  if [[ -z "${RESTIC_REPOSITORY:-}" ]]; then
    echo "RESTIC_REPOSITORY is missing from $BACKUP_ENV_FILE" >&2
    exit 1
  fi

  if [[ -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
    export RESTIC_PASSWORD_FILE="$BACKUP_PASSWORD_FILE"
  fi

  if [[ ! -f "$RESTIC_PASSWORD_FILE" ]]; then
    echo "Restic password file not found at $RESTIC_PASSWORD_FILE" >&2
    echo "Run: yarn backup:setup" >&2
    exit 1
  fi
}
