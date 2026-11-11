#!/usr/bin/env bash
set -eo pipefail
cd "$(dirname "$0")/.."
source /home/gokul/zephyrproject/.venv/bin/activate
export ZEPHYR_BASE=/home/gokul/zephyrproject/zephyr
python3 scripts/firmware_bench.py
