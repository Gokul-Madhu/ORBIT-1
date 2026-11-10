#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v west >/dev/null || { echo 'west not found. Activate your Zephyr Python environment.' >&2; exit 1; }
: "${ZEPHYR_BASE:?Source your Zephyr environment or set ZEPHYR_BASE first}"
export QEMU_BIN_PATH="${QEMU_BIN_PATH:-/usr/bin}"
cd "$ROOT"
west build -b qemu_x86/atom -d zephyr/build-mission zephyr -- "-DQEMU=$QEMU_BIN_PATH/qemu-system-i386"
printf '\nRun the complete application with: bash scripts/launch.sh --skip-build\n'
