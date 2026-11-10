#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ " $* " != *" --no-qemu "* ]]; then
  ZEPHYR_WORKSPACE="${ORBIT_ZEPHYR_WORKSPACE:-$HOME/zephyrproject}"
  if [[ ! -f "$ZEPHYR_WORKSPACE/.venv/bin/activate" ]]; then
    echo "Existing Zephyr venv not found: $ZEPHYR_WORKSPACE/.venv" >&2
    exit 1
  fi
  source "$ZEPHYR_WORKSPACE/.venv/bin/activate"
  export ZEPHYR_BASE="${ZEPHYR_BASE:-$ZEPHYR_WORKSPACE/zephyr}"
  export QEMU_BIN_PATH="${QEMU_BIN_PATH:-/usr/bin}"
fi
exec python3 -m orbit1.launcher "$@"
