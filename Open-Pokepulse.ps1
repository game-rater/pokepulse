$ErrorActionPreference = 'Stop'
$port = 3000
$client = [System.Net.Sockets.TcpClient]::new()
$running = $false
try {
  $client.Connect('127.0.0.1', $port)
  $running = $true
} catch {
  $server = Join-Path $PSScriptRoot 'server.mjs'
  $node = Join-Path $PSScriptRoot 'node.exe'
  if (-not (Test-Path -LiteralPath $server) -or -not (Test-Path -LiteralPath $node)) {
    throw 'PokéPulse files are missing. Extract the entire ZIP before opening it.'
  }
  Start-Process -FilePath $node -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
} finally {
  $client.Dispose()
}

if (-not $running) {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    $check = [System.Net.Sockets.TcpClient]::new()
    try {
      $check.Connect('127.0.0.1', $port)
      $ready = $true
      break
    } catch {
    } finally {
      $check.Dispose()
    }
  }
  if (-not $ready) { throw 'PokéPulse did not start. Restart your computer and try again.' }
}

Start-Process 'http://127.0.0.1:3000'
