$ErrorActionPreference='Stop'
$workspace=Split-Path $PSScriptRoot -Parent
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$automation=Get-ChildItem (Join-Path $env:WINDIR 'Microsoft.NET/assembly/GAC_MSIL/System.Management.Automation') -Recurse -Filter System.Management.Automation.dll | Select-Object -First 1 -ExpandProperty FullName
if(-not $automation){throw 'Windows PowerShell runtime is missing.'}
$response=Join-Path $env:TEMP ('pokepulse-build-'+[guid]::NewGuid()+'.rsp')
$arguments=@('/nologo','/target:winexe','/platform:x64',('/reference:"'+$automation+'"'),'/reference:System.Windows.Forms.dll',('/win32icon:"'+(Join-Path $workspace 'run-bun\assets\pokepulse.ico')+'"'),('/out:"'+(Join-Path $workspace 'run-bun\Pokepulse.exe')+'"'),('"'+(Join-Path $workspace 'run-bun\PokepulseHost.cs')+'"'))
try {
 $arguments | Set-Content -LiteralPath $response -Encoding UTF8
 & $compiler ('@'+$response)
} finally {Remove-Item -LiteralPath $response}
if($LASTEXITCODE -ne 0){throw 'PokéPulse host compilation failed.'}
