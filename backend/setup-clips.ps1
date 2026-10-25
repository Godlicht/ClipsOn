$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location $projectPath
try {
    if (-not (Test-Path 'backend/.venv/Scripts/python.exe')) { throw 'Najpierw uruchom backend/setup.ps1.' }
    & backend/.venv/Scripts/python.exe -m backend.highlight_model
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się pobrać modelu wyboru klipów. Ponowienie wznowi pobieranie.' }
} finally { Pop-Location }
