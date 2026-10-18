$ErrorActionPreference = 'Stop'
try {
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3002
$app = Join-Path $root 'dist\Run-and-Bun-Automatic'
$server = Join-Path $app 'run-bun\server.mjs'
$node = Join-Path $app 'node.exe'
$overlay = Join-Path $root 'run-bun\Pokepulse.exe'
$rom = Join-Path $root 'Human Testing\1986 - Pokemon Emerald (U)(TrashMan) (patched).gba'
# Prefer the ROM/save pair beside this launcher. Support the former local
# Documents location when the project has been moved without its game files.
if (-not (Test-Path -LiteralPath $rom -PathType Leaf)) {
    $originalRom = Join-Path $env:USERPROFILE 'Documents\Pokethreat Meter\Human Testing\1986 - Pokemon Emerald (U)(TrashMan) (patched).gba'
    if (Test-Path -LiteralPath $originalRom -PathType Leaf) { $rom = $originalRom }
}
$mgba = Join-Path $root '.local-tools\mgba\mGBA-0.10.5-win64\mGBA.exe'
$expectedRomHash = '68EC5B0C02E6DEF8DA8DC2B1857B269505418803D44CC2B816FB7471587BF89D'

foreach ($path in @($server, $node, $overlay, $rom, $mgba)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $path"
    }
}

$romStream = [IO.File]::OpenRead($rom)
$romHasher = [Security.Cryptography.SHA256]::Create()
try { $actualRomHash = [BitConverter]::ToString($romHasher.ComputeHash($romStream)).Replace('-', '') }
finally { $romStream.Dispose(); $romHasher.Dispose() }
if ($actualRomHash -ne $expectedRomHash) {
    throw 'The selected ROM is not the Run & Bun 1.07 ROM validated by PokéPulse.'
}

$serverReady = $false
function Test-PokePulseServer {
    try {
        $request = [Net.WebRequest]::Create("http://127.0.0.1:$port/")
        $request.Timeout = 2000
        $response = $request.GetResponse()
        try { return ($response.StatusCode -eq [Net.HttpStatusCode]::OK) }
        finally { $response.Close() }
    } catch { return $false }
}
$serverReady = Test-PokePulseServer

if (-not $serverReady) {
    $previousPort = $env:PORT
    try {
        $env:PORT = [string]$port
        Start-Process -FilePath $node -ArgumentList @(('"' + $server + '"')) -WorkingDirectory $app -WindowStyle Hidden
    } finally { $env:PORT = $previousPort }
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        $serverReady = Test-PokePulseServer
        if ($serverReady) { break }
    }
}
if (-not $serverReady) { throw "PokéPulse could not start its local server on port $port." }

$overlayProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'Pokepulse.exe' -and $_.ExecutablePath -eq $overlay
})
$overlayRunning = $overlayProcesses | Where-Object {
    $_.CommandLine -match ('\s' + $port + '\s*$')
} | Select-Object -First 1
if (-not $overlayRunning) {
    foreach ($oldOverlay in $overlayProcesses) {
        $window = Get-Process -Id $oldOverlay.ProcessId -ErrorAction SilentlyContinue
        if ($window -and $window.MainWindowTitle -eq 'PokéPulse - Stream Overlay') {
            $null = $window.CloseMainWindow()
        }
    }
    Start-Process -FilePath $overlay -ArgumentList @([string]$port) -WindowStyle Hidden
}

$mgbaRunning = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $mgba -and $_.CommandLine -like "*$rom*"
} | Select-Object -First 1
if (-not $mgbaRunning) {
    Start-Process -FilePath $mgba -ArgumentList @(('"' + $rom + '"')) -WorkingDirectory (Split-Path -Parent $mgba)
}

Write-Host 'PokéPulse is ready. In mGBA, load the integration once per session:' -ForegroundColor Green
Write-Host 'Tools > Scripting > File > Load script, then choose:'
Write-Host (Join-Path $app 'run-bun\PokeThreat.lua')
Write-Host 'Keep the server and overlay running, load the script, and play normally.'

} catch {
    $failure = $_.Exception.Message
    $logPath = Join-Path $PSScriptRoot 'pokepulse-startup-error.log'
    ('{0:o} {1}' -f (Get-Date), $failure) | Add-Content -LiteralPath $logPath -Encoding UTF8
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        "PokéPulse could not start.`n`n$failure`n`nDetails: $logPath",
        'PokéPulse startup error',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}
