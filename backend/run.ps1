param([ValidateSet('auto', 'cpu', 'cuda')][string]$Device = 'auto')
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location $projectPath
try {
    if (-not (Test-Path 'backend/.venv/Scripts/python.exe')) { throw 'Najpierw uruchom backend/setup.ps1.' }
    $env:CLIPSON_DEVICE = $Device
    & backend/.venv/Scripts/python.exe -m uvicorn backend.server:app --host 127.0.0.1 --port 8765
} finally { Pop-Location }
