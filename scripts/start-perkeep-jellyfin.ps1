# Start the Perkeep -> Jellyfin stack (auto-run at Windows logon).
#
#   1) WebDAV gateway  (:8099)  streams video straight from Perkeep, NO extra storage
#   2) rclone mount    (C:\pk-media) real filesystem view of the gateway (WinFsp)
#   3) Jellyfin        (:8096)  library "Perkeep" points at C:\pk-media
#
# Why not drive J: ? Jellyfin cannot read a WebDAV drive letter / UNC share
# (the redirector is not usable from its process), but it CAN read a WinFsp
# mount point, because that is a real filesystem object.
#
# Manual : right-click -> Run with PowerShell
# Auto   : shortcut to start-perkeep-jellyfin.vbs in shell:startup (already installed)
# Log    : %LOCALAPPDATA%\perkeep-jellyfin.log
#
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI and
# Vietnamese characters would break the parser.

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:LOCALAPPDATA 'perkeep-jellyfin.log'
$mountPoint = 'C:\pk-media'

function Write-Log($msg) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $log -Value $line -Encoding UTF8
}

function Test-Port([int]$port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $port)
        $ok = $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}

function Find-Rclone {
    $cmd = (Get-Command rclone -ErrorAction SilentlyContinue).Source
    if ($cmd) { return $cmd }
    $pkg = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Directory -Filter 'Rclone.Rclone_*' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($pkg) {
        $exe = Get-ChildItem $pkg.FullName -Recurse -Filter 'rclone.exe' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($exe) { return $exe.FullName }
    }
    return $null
}

Write-Log '=== start ==='

# ---------- 1. WebDAV gateway (:8099) ----------
if (Test-Port 8099) {
    Write-Log 'gateway: already running'
} else {
    $bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
    if (-not $bun) { $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
    if (Test-Path $bun) {
        Start-Process -FilePath $bun -ArgumentList 'run', (Join-Path $root 'scripts\jellyfin-gateway.mjs') `
            -WorkingDirectory $root -WindowStyle Hidden
        Write-Log "gateway: started ($bun)"
        $tries = 0
        while (-not (Test-Port 8099) -and $tries -lt 20) { Start-Sleep -Milliseconds 500; $tries++ }
        if (Test-Port 8099) { Write-Log 'gateway: port 8099 up' } else { Write-Log 'gateway: FAILED to open 8099' }
    } else {
        Write-Log "gateway: bun not found ($bun)"
    }
}

# ---------- 2. rclone mount (C:\pk-media) ----------
$mounted = $false
if (Test-Path $mountPoint) {
    $mounted = @(Get-ChildItem $mountPoint -ErrorAction SilentlyContinue).Count -gt 0
}
if ($mounted) {
    Write-Log "mount: $mountPoint already has files"
} else {
    $rclone = Find-Rclone
    if ($rclone) {
        $rlog = Join-Path $env:LOCALAPPDATA 'pk-media-rclone.log'
        Start-Process -FilePath $rclone -ArgumentList @(
            'mount', 'perkeep:', $mountPoint,
            '--vfs-cache-mode', 'off',
            '--dir-cache-time', '10s',
            '--attr-timeout', '10s',
            '--allow-non-empty',
            '--volname', 'Perkeep',
            '--log-level', 'INFO',
            '--log-file', $rlog
        ) -WindowStyle Hidden
        Write-Log "mount: started ($rclone)"
        $tries = 0
        while (-not (@(Get-ChildItem $mountPoint -ErrorAction SilentlyContinue).Count -gt 0) -and $tries -lt 30) {
            Start-Sleep -Milliseconds 500
            $tries++
        }
        $count = @(Get-ChildItem $mountPoint -ErrorAction SilentlyContinue).Count
        if ($count -gt 0) { Write-Log "mount: OK ($count files)" } else { Write-Log 'mount: FAILED (empty) - see pk-media-rclone.log' }
    } else {
        Write-Log 'mount: rclone not found (winget install Rclone.Rclone)'
    }
}

# ---------- 3. Jellyfin (user session) ----------
$jf = Get-Process jellyfin -ErrorAction SilentlyContinue
if ($jf) {
    Write-Log "jellyfin: already running (PID $($jf.Id))"
} else {
    $exe = 'C:\Program Files\Jellyfin\Server\jellyfin.exe'
    if (Test-Path $exe) {
        $data = Join-Path $env:LOCALAPPDATA 'jellyfin-data'
        New-Item -ItemType Directory -Force $data | Out-Null
        Start-Process -FilePath $exe -ArgumentList '--datadir', $data -WindowStyle Hidden
        Write-Log "jellyfin: started (datadir $data)"
    } else {
        Write-Log "jellyfin: not installed ($exe)"
    }
}

# ---------- 4. Web + APK server (:4173) ----------
if (Test-Port 4173) {
    Write-Log 'serve: 4173 already up'
} else {
    $serve = Join-Path $PSScriptRoot 'serve-app.ps1'
    if (Test-Path $serve) {
        Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $serve -WindowStyle Hidden
        Write-Log 'serve: starting (:4173)'
    } else {
        Write-Log 'serve: serve-app.ps1 not found'
    }
}

Write-Log '=== done ==='
