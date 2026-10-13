# Dot-source in the current PowerShell: . .\scripts\project-shell.ps1
$kejianRoot = Split-Path -Parent $PSScriptRoot
$kejianCache = Join-Path $kejianRoot '.cache'
$env:TEMP = Join-Path $kejianCache 'temp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:npm_config_cache = Join-Path $kejianCache 'npm'
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Set-Location -LiteralPath $kejianRoot
