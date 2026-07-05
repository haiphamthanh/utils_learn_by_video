#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-common.sh"

ensure_config_dir

if [[ ! -f "$BACKUP_ENV_FILE" ]]; then
  cat > "$BACKUP_ENV_FILE" <<'EOF'
export AWS_ACCESS_KEY_ID="YOUR_BACKBLAZE_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_BACKBLAZE_APPLICATION_KEY"
export RESTIC_REPOSITORY="s3:https://YOUR_B2_S3_ENDPOINT/YOUR_BUCKET_NAME/enjoy-journal"
export RESTIC_PASSWORD_FILE="$HOME/.config/enjoy-journal/restic-password"
EOF
  echo "Created backup config template at $BACKUP_ENV_FILE"
else
  echo "Backup config already exists at $BACKUP_ENV_FILE; leaving it unchanged"
fi

chmod 600 "$BACKUP_ENV_FILE"

if [[ ! -f "$BACKUP_PASSWORD_FILE" ]]; then
  openssl rand -base64 48 > "$BACKUP_PASSWORD_FILE"
fi

chmod 600 "$BACKUP_PASSWORD_FILE"

echo "Restic password file is ready at $BACKUP_PASSWORD_FILE"
echo "Edit $BACKUP_ENV_FILE and fill in your Backblaze credentials, then run:"
echo "  source $BACKUP_ENV_FILE"
echo "  yarn backup"
