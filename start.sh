#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Starting Enjoy Journal"
echo

for command_name in node npm python3; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    echo "Run: ./scripts/doctor.sh"
    exit 1
  fi
done

mkdir -p data/inbox data/lessons data/temp

if [ ! -d node_modules ]; then
  echo "Installing Node.js dependencies..."
  npm install
fi

echo "Initializing database..."
npm run migrate

echo
echo "Open http://localhost:${PORT:-3000}"
echo

npm start
