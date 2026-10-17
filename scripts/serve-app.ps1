# Serve the built web app + APK on http://<LAN-IP>:4173 (hidden, detached).
#   dist/app-debug.apk  ->  http://<LAN-IP>:4173/app-debug.apk
#   web app             ->  http://localhost:4173/  (proxy /pk -> perkeepd :3179)
#
# Chay tay : powershell -ExecutionPolicy Bypass -File scripts\serve-app.ps1
# Log      : %LOCALAPPDATA%\pk-serve.log
# ASCII only: Windows PowerShell 5.1 doc UTF-8 khong BOM theo ANSI se vo parser.

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:LOCALAPPDATA 'pk-serve.log'

function Test-Port([int]$port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $port)
        $ok = $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}

if (Test-Port 4173) { Write-Host '4173 da chay'; exit 0 }

$bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $bun) { $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
if (-not (Test-Path $bun)) { Write-Host "khong thay bun: $bun"; exit 1 }

Start-Process -FilePath $bun -ArgumentList 'run', 'preview', '--', '--host', '--port', '4173' `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err"

$tries = 0
while (-not (Test-Port 4173) -and $tries -lt 20) { Start-Sleep -Milliseconds 500; $tries++ }
if (Test-Port 4173) { Write-Host 'serve: 4173 up' } else { Write-Host 'serve: FAILED (xem pk-serve.log)' }
