$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location $projectPath
try {
    if (-not (Test-Path 'backend/.venv/Scripts/python.exe')) {
        python -m venv backend/.venv
        if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć środowiska Python.' }
    }
    & backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zainstalować zależności.' }
    Write-Host 'Gotowe. Uruchom: powershell -File backend/run.ps1'
} finally { Pop-Location }
