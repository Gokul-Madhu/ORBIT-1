$ErrorActionPreference = 'Stop'
wsl.exe -d Ubuntu-24.04 --cd $PSScriptRoot -- python3 scripts/stop.py @args
exit $LASTEXITCODE
