#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m orbit1.ground --mock "$@"
