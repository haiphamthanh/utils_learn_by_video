#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Repairing Enjoy Journal Python environment"
echo

if [ -d .venv ]; then
  echo "Removing the broken .venv..."
  rm -rf .venv
fi

bash ./scripts/setup-python.sh

echo
echo "Python environment repaired."
