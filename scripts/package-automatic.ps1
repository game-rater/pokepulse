param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $workspace 'dist/Run-and-Bun-Automatic'
if (Test-Path -LiteralPath $destination) { throw 'Automatic package directory already exists. Preserve or rename it before rebuilding.' }
New-Item -ItemType Directory -Path (Join-Path $destination 'run-bun/reference') -Force | Out-Null
foreach ($name in @('server.mjs','search-worker.mjs','search-service.mjs','refinement.mjs','display-estimate.mjs','profile.mjs','identity.mjs','live-effects.mjs','move-history.mjs','move-coverage.json','battle-recorder.mjs','actions.mjs','accuracy.mjs','move-effects.json','input.mjs','snapshot.mjs','memory.mjs','bridge.mjs','integration.mjs','live.html','live-app.mjs','pokepulse-overlay.ps1','Pokepulse.exe','appearance-picker.ps1','screen-color-picker.ps1','VALIDATION.md')) {
  Copy-Item -LiteralPath (Join-Path $workspace "run-bun/$name") -Destination (Join-Path $destination 'run-bun')
}
Copy-Item -LiteralPath (Join-Path $workspace 'run-bun/assets') -Destination (Join-Path $destination 'run-bun/assets') -Recurse
Copy-Item -LiteralPath (Join-Path $workspace 'run-bun/reference/mappings.json') -Destination (Join-Path $destination 'run-bun/reference')
Copy-Item -LiteralPath (Join-Path $workspace 'run-bun/reference/adapter-profile.json') -Destination (Join-Path $destination 'run-bun/reference')
foreach ($name in @('analysis','vendor','data','engine.mjs','battle-engine.mjs','style.css','package.json','README.md','SEARCH-BENCHMARKS.md','Start Run and Bun.cmd','Start PokéPulse Overlay.cmd')) {
  Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $destination -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $destination 'scripts') -Force | Out-Null
foreach ($name in @('benchmark-retained-turn.mjs','benchmark-retained-turn-worker.mjs','search-benchmark-fixtures.mjs','benchmark-search-race.mjs','benchmark-search-race-worker.mjs','benchmark-bound-pruning.mjs')) {
  Copy-Item -LiteralPath (Join-Path $workspace "scripts/$name") -Destination (Join-Path $destination 'scripts')
}
$calcPath = & $NodePath --input-type=module -e "import {realpathSync} from 'node:fs';console.log(realpathSync('node_modules/@smogon/calc'));"
New-Item -ItemType Directory -Path (Join-Path $destination 'node_modules/@smogon') -Force | Out-Null
Copy-Item -LiteralPath $calcPath -Destination (Join-Path $destination 'node_modules/@smogon/calc') -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $destination 'node.exe')
Compress-Archive -LiteralPath $destination -DestinationPath (Join-Path $workspace 'dist/Run-and-Bun-Automatic-Windows.zip')
Write-Output 'Created dist/Run-and-Bun-Automatic-Windows.zip (experimental automatic preview)'



