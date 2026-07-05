#!/usr/bin/env bash
set -u

failures=0

check_command() {
  local command_name="$1"
  local display_name="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    printf "✓ %s\n" "$display_name"
  else
    printf "✗ %s\n" "$display_name"
    failures=$((failures + 1))
  fi
}

echo "Enjoy Journal Doctor"
echo

check_command node "Node.js"
check_command npm "npm"
check_command python3 "Python 3"
check_command ffmpeg "FFmpeg"

echo

if [ "$failures" -eq 0 ]; then
  echo "Environment looks ready."
  exit 0
fi

echo "$failures requirement(s) are missing."
exit 1
