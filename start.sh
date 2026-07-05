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

for command_name in node python3 ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name"
    echo "Run: ./scripts/doctor.sh"
    exit 1
  fi
done

run_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack yarn "$@"
    return
  fi

  echo "Yarn is required but neither yarn nor Corepack is available."
  echo "Install Yarn, or install a Node.js distribution that includes Corepack."
  exit 1
}

mkdir -p data/inbox/uploads data/lessons data/temp

if [ ! -d node_modules ]; then
  echo "Installing Node.js dependencies with Yarn..."
  if [ -f yarn.lock ]; then
    run_yarn install --frozen-lockfile
  else
    run_yarn install
  fi
fi

echo "Initializing database..."
run_yarn migrate

echo
echo "Open http://localhost:${PORT:-3000}"
echo

run_yarn start
