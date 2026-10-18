param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $workspace 'dist/Run-and-Bun-Meter'
if (Test-Path -LiteralPath $destination) { throw 'Package folder already exists. Choose a clean workspace package directory before rebuilding.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($name in @('run-bun','analysis','vendor','data','engine.mjs','battle-engine.mjs','app.mjs','style.css','package.json','README.md')) {
  Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $destination -Recurse
}
# Flatten this dependency so the ZIP does not depend on pnpm symlinks.
$calcPath = & $NodePath --input-type=module -e "import {realpathSync} from 'node:fs';console.log(realpathSync('node_modules/@smogon/calc'));"
New-Item -ItemType Directory -Path (Join-Path $destination 'node_modules/@smogon') -Force | Out-Null
Copy-Item -LiteralPath $calcPath -Destination (Join-Path $destination 'node_modules/@smogon/calc') -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $destination 'node.exe')
@'
@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:3001/
node.exe run-bun/server.mjs
pause
'@ | Set-Content -LiteralPath (Join-Path $destination 'Start Run and Bun.cmd') -Encoding ascii
Compress-Archive -LiteralPath $destination -DestinationPath (Join-Path $workspace 'dist/Run-and-Bun-Meter-Windows.zip')
Write-Output 'Created dist/Run-and-Bun-Meter-Windows.zip'
