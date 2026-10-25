param([ValidateSet('auto', 'cpu', 'cuda')][string]$Device = 'auto')
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
    $installCuda = $Device -eq 'cuda'
    if ($Device -eq 'auto' -and (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
        & nvidia-smi -L | Out-Null
        $installCuda = $LASTEXITCODE -eq 0
    }
    if ($installCuda) {
        & backend/.venv/Scripts/python.exe -m pip install --upgrade torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128
        if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zainstalować PyTorch z CUDA 12.8.' }
    }
    Write-Host 'Gotowe. Uruchom: powershell -File backend/run.ps1'
} finally { Pop-Location }
