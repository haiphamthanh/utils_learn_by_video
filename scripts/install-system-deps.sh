#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

ASSUME_YES=0
CHECK_ONLY=0
INSTALL_BUILD_TOOLS=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      ASSUME_YES=1
      ;;
    --check)
      CHECK_ONLY=1
      ;;
    --build-tools)
      INSTALL_BUILD_TOOLS=1
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--yes] [--check] [--build-tools]"
      exit 2
      ;;
  esac
done

log() {
  printf '%s\n' "$*"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

have_python39() {
  if have python3.9; then
    return 0
  fi

  if have python3; then
    python3 - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info[:2] == (3, 9) else 1)
PY
    return $?
  fi

  return 1
}

confirm() {
  local prompt="$1"

  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    return 1
  fi

  printf "%s [Y/n] " "$prompt"
  read -r answer
  case "${answer:-Y}" in
    Y|y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if have sudo; then
    sudo "$@"
    return
  fi

  echo "This installation requires administrator privileges, but sudo is unavailable."
  exit 1
}

refresh_homebrew_path() {
  if have brew; then
    return 0
  fi

  local brew_bin=""
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    if [ -x "$candidate" ]; then
      brew_bin="$candidate"
      break
    fi
  done

  if [ -n "$brew_bin" ]; then
    eval "$("$brew_bin" shellenv)"
  fi
}

install_homebrew_if_needed() {
  refresh_homebrew_path
  if have brew; then
    return 0
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    return 1
  fi

  if ! have curl; then
    echo "Homebrew is missing and curl is unavailable. Install curl first, then rerun ./start.sh."
    exit 1
  fi

  if [ "$(uname -s)" = "Darwin" ] && ! xcode-select -p >/dev/null 2>&1; then
    log "macOS Command Line Tools are required before Homebrew can be installed."
    log "Opening the Apple installer now..."
    xcode-select --install >/dev/null 2>&1 || true
    echo
    echo "Finish the Command Line Tools installation, then run ./start.sh again."
    exit 1
  fi

  if ! confirm "Homebrew is missing. Install Homebrew now?"; then
    echo "Homebrew installation skipped."
    exit 1
  fi

  log "Installing Homebrew..."
  if [ "$ASSUME_YES" -eq 1 ]; then
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  else
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  refresh_homebrew_path

  if ! have brew; then
    echo "Homebrew was installed but is not available on PATH in this shell."
    echo "Restart the terminal, then run ./start.sh again."
    exit 1
  fi
}

print_missing_summary() {
  local missing=()

  have node || missing+=("Node.js")
  have python3 || missing+=("Python 3")
  have ffmpeg || missing+=("FFmpeg")
  have ffprobe || missing+=("FFprobe")

  if ! have yarn && ! have yarnpkg && ! have corepack; then
    missing+=("Yarn/Corepack")
  fi

  if [ "$INSTALL_BUILD_TOOLS" -eq 1 ]; then
    case "$(uname -s)" in
      Darwin)
        xcode-select -p >/dev/null 2>&1 || missing+=("macOS Command Line Tools")
        ;;
      Linux)
        have make || missing+=("make")
        if ! have cc && ! have gcc && ! have clang; then
          missing+=("C/C++ compiler")
        fi
        ;;
    esac
  fi

  if [ "${#missing[@]}" -eq 0 ]; then
    log "All required system dependencies are available."
    return 0
  fi

  log "Missing system dependencies: ${missing[*]}"
  return 1
}

install_macos() {
  install_homebrew_if_needed

  local formulae=()
  have node || formulae+=("node")
  have_python39 || formulae+=("python@3.9")

  if ! have ffmpeg || ! have ffprobe; then
    formulae+=("ffmpeg")
  fi

  if ! have yarn && ! have yarnpkg && ! have corepack; then
    formulae+=("yarn")
  fi

  if [ "${#formulae[@]}" -gt 0 ]; then
    log "Installing missing packages with Homebrew: ${formulae[*]}"
    brew install "${formulae[@]}"
  fi

  if [ "$INSTALL_BUILD_TOOLS" -eq 1 ] && ! xcode-select -p >/dev/null 2>&1; then
    log "Requesting macOS Command Line Tools for native module compilation..."
    xcode-select --install >/dev/null 2>&1 || true
    echo "Finish the Command Line Tools installation, then rerun the command."
    exit 1
  fi
}

install_apt() {
  local packages=()

  have node || packages+=("nodejs")
  have python3 || packages+=("python3")

  if ! have ffmpeg || ! have ffprobe; then
    packages+=("ffmpeg")
  fi

  if [ "$INSTALL_BUILD_TOOLS" -eq 1 ]; then
    packages+=("build-essential")
  fi

  if ! have yarn && ! have yarnpkg && ! have corepack; then
    packages+=("yarnpkg")
  fi

  if [ "${#packages[@]}" -gt 0 ]; then
    log "Installing missing packages with apt: ${packages[*]}"
    sudo_cmd apt-get update
    sudo_cmd apt-get install -y "${packages[@]}"
  fi
}

install_dnf() {
  local packages=()

  have node || packages+=("nodejs")
  have python3 || packages+=("python3")

  if ! have ffmpeg || ! have ffprobe; then
    packages+=("ffmpeg")
  fi

  if [ "$INSTALL_BUILD_TOOLS" -eq 1 ]; then
    packages+=("gcc-c++" "make")
  fi

  if [ "${#packages[@]}" -gt 0 ]; then
    log "Installing missing packages with dnf: ${packages[*]}"
    sudo_cmd dnf install -y "${packages[@]}"
  fi
}

install_pacman() {
  local packages=()

  have node || packages+=("nodejs")
  have python3 || packages+=("python")

  if ! have ffmpeg || ! have ffprobe; then
    packages+=("ffmpeg")
  fi

  if [ "$INSTALL_BUILD_TOOLS" -eq 1 ]; then
    packages+=("base-devel")
  fi

  if ! have yarn && ! have yarnpkg && ! have corepack; then
    packages+=("yarn")
  fi

  if [ "${#packages[@]}" -gt 0 ]; then
    log "Installing missing packages with pacman: ${packages[*]}"
    sudo_cmd pacman -Sy --needed --noconfirm "${packages[@]}"
  fi
}

main() {
  log "Enjoy Journal System Setup"
  log

  refresh_homebrew_path

  if print_missing_summary; then
    return 0
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    return 1
  fi

  case "$(uname -s)" in
    Darwin)
      install_macos
      ;;
    Linux)
      if have apt-get; then
        install_apt
      elif have dnf; then
        install_dnf
      elif have pacman; then
        install_pacman
      elif have brew; then
        install_macos
      else
        echo "No supported package manager was found."
        echo "Install Node.js, Python 3 and FFmpeg manually, then rerun ./start.sh."
        exit 1
      fi
      ;;
    *)
      echo "Automatic system dependency installation currently supports macOS and Linux."
      exit 1
      ;;
  esac

  refresh_homebrew_path
  log

  if ! print_missing_summary; then
    echo
    echo "Some dependencies are still missing after installation."
    echo "Run ./scripts/doctor.sh for details."
    exit 1
  fi

  log
  log "System setup complete."
}

main
