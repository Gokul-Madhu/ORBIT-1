# Start the complete simulation in the explicitly selected WSL distribution.
$ErrorActionPreference = 'Stop'
wsl.exe -d Ubuntu-24.04 --cd $PSScriptRoot -- bash scripts/launch.sh @args
exit $LASTEXITCODE
