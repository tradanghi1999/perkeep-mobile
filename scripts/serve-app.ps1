# Serve the built web app + APK on http://<LAN-IP>:4173 (hidden, detached).
#   dist/app-debug.apk  ->  http://<LAN-IP>:4173/app-debug.apk  (dung MIME .apk)
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

# Ban cu: vite preview (node) hoac bun run preview. Ban moi: serve-app.mjs
function Get-OldServers {
    Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*vite*preview*') -or
        ($_.Name -eq 'bun.exe'  -and $_.CommandLine -like '*run preview*')
    }
}
function Get-NewServers {
    Get-CimInstance Win32_Process -Filter "Name='bun.exe'" |
        Where-Object { $_.CommandLine -like '*serve-app.mjs*' }
}

$old = @(Get-OldServers)
if ($old.Count -gt 0) {
    Write-Host "dung server cu (vite preview) PID $($old.ProcessId -join ',')"
    $old | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep -Milliseconds 1200
}

$new = @(Get-NewServers)
if ($new.Count -gt 0 -and (Test-Port 4173)) {
    Write-Host 'serve: 4173 da chay (serve-app.mjs)'
    exit 0
}

$bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $bun) { $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
if (-not (Test-Path $bun)) { Write-Host "khong thay bun: $bun"; exit 1 }

Start-Process -FilePath $bun -ArgumentList 'run', (Join-Path $PSScriptRoot 'serve-app.mjs') `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError "$log.err"

$tries = 0
while (-not (Test-Port 4173) -and $tries -lt 20) { Start-Sleep -Milliseconds 500; $tries++ }
if (Test-Port 4173) { Write-Host 'serve: 4173 up (apk MIME ok)' } else { Write-Host 'serve: FAILED (xem pk-serve.log)' }
