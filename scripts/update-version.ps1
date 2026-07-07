param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot '..\package.json'
$content = Get-Content $path -Raw
$updated = $content -replace '"version":\s*"[^"]+"', ('"version": "' + $Version + '"')
Set-Content -Path $path -Value $updated -NoNewline
