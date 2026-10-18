param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $OutputDirectory 'Pokepulse Package Root'
$appFiles = Join-Path $destination 'Pokepulse App Files (Leave Here)'
$archive = Join-Path $OutputDirectory 'Pokethreat-Meter-Portable-Windows.zip'
if (Test-Path -LiteralPath $destination) { throw "Package directory already exists. Preserve or rename it before rebuilding: $destination" }
if (Test-Path -LiteralPath $archive) { throw "Package archive already exists. Preserve or rename it before rebuilding: $archive" }
New-Item -ItemType Directory -Path $OutputDirectory,$destination,$appFiles -Force | Out-Null
foreach ($name in @('analysis','vendor','data')) {
  Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $appFiles -Recurse
}
foreach ($name in @('server.mjs','app.mjs','index.html','style.css','engine.mjs','battle-engine.mjs','package.json','README.md','SEARCH-BENCHMARKS.md','Start Run and Bun.cmd','Start PokéPulse Overlay.cmd','Open-Pokepulse.ps1')) {
  Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $appFiles
}
New-Item -ItemType Directory -Path (Join-Path $appFiles 'scripts') -Force | Out-Null
foreach ($name in @('benchmark-retained-turn.mjs','benchmark-retained-turn-worker.mjs','search-benchmark-fixtures.mjs','benchmark-search-race.mjs','benchmark-search-race-worker.mjs','benchmark-bound-pruning.mjs')) {
  Copy-Item -LiteralPath (Join-Path $workspace "scripts/$name") -Destination (Join-Path $appFiles 'scripts')
}
foreach ($name in @('server.mjs','search-worker.mjs','search-service.mjs','refinement.mjs','display-estimate.mjs','profile.mjs','identity.mjs','live-effects.mjs','move-history.mjs','move-coverage.json','battle-recorder.mjs','actions.mjs','accuracy.mjs','move-effects.json','input.mjs','snapshot.mjs','memory.mjs','bridge.mjs','integration.mjs','live.html','live-app.mjs','pokepulse-overlay.ps1','Pokepulse.exe','appearance-picker.ps1','screen-color-picker.ps1','VALIDATION.md')) {
  New-Item -ItemType Directory -Path (Join-Path $appFiles 'run-bun') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $workspace "run-bun/$name") -Destination (Join-Path $appFiles 'run-bun')
}
Copy-Item -LiteralPath (Join-Path $workspace 'run-bun/assets') -Destination (Join-Path $appFiles 'run-bun/assets') -Recurse
New-Item -ItemType Directory -Path (Join-Path $appFiles 'run-bun/reference') -Force | Out-Null
foreach ($name in @('mappings.json','adapter-profile.json')) {
  Copy-Item -LiteralPath (Join-Path $workspace "run-bun/reference/$name") -Destination (Join-Path $appFiles 'run-bun/reference')
}
$calcPath = & $NodePath --input-type=module -e "import {realpathSync} from 'node:fs';console.log(realpathSync('node_modules/@smogon/calc'));"
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve @smogon/calc from the workspace.' }
New-Item -ItemType Directory -Path (Join-Path $appFiles 'node_modules/@smogon') -Force | Out-Null
Copy-Item -LiteralPath $calcPath -Destination (Join-Path $appFiles 'node_modules/@smogon/calc') -Recurse
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $appFiles 'node.exe')
foreach ($name in @('00 - OPEN POKEPULSE.cmd','00 - START HERE.txt')) {
  Copy-Item -LiteralPath (Join-Path $workspace $name) -Destination $destination
}
Compress-Archive -Path (Join-Path $destination '*') -DestinationPath $archive
Write-Output "Created $archive"



