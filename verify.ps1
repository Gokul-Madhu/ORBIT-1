$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
node tests/test_model.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
wsl.exe -d Ubuntu-24.04 --cd $PSScriptRoot -- bash scripts/verify.sh
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python scripts/browser_acceptance.py @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
wsl.exe -d Ubuntu-24.04 --cd $PSScriptRoot -- python3 scripts/combine_evidence.py
exit $LASTEXITCODE
