#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "${ORBIT_ZEPHYR_WORKSPACE:-$HOME/zephyrproject}/.venv/bin/activate"
export ZEPHYR_BASE="${ZEPHYR_BASE:-${ORBIT_ZEPHYR_WORKSPACE:-$HOME/zephyrproject}/zephyr}"
export QEMU_BIN_PATH="${QEMU_BIN_PATH:-/usr/bin}"
exec python3 scripts/verify_backend.py
