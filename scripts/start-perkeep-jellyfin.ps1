# Khởi động "cụm" Perkeep → Jellyfin:
#   1) gateway WebDAV (đọc video trực tiếp từ Perkeep, không copy)
#   2) Jellyfin chạy trong phiên người dùng (để thấy ổ J:)
#
# Dùng: chuột phải → Run with PowerShell
# Muốn tự chạy khi đăng nhập: tạo shortcut tới file này trong  shell:startup

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot

# ---------- 1. Gateway WebDAV (:8099) ----------
$gatewayUp = (Test-NetConnection -ComputerName 127.0.0.1 -Port 8099 -InformationLevel Quiet)
if (-not $gatewayUp) {
    Write-Host "Khởi động gateway WebDAV (:8099)..."
    $bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
    if (-not $bun) { $bun = "$env:USERPROFILE\.bun\bin\bun.exe" }
    Start-Process -FilePath $bun -ArgumentList "run", "$root\scripts\jellyfin-gateway.mjs" `
        -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "Gateway đã chạy (:8099)"
}

# ---------- 2. Map ổ J: ----------
if (-not (Test-Path 'J:\')) {
    Write-Host "Map ổ J: -> gateway..."
    net use J: http://127.0.0.1:8099/ /persistent:yes | Out-Null
}

# ---------- 3. Jellyfin (phiên người dùng) ----------
$jf = Get-Process jellyfin -ErrorAction SilentlyContinue
if (-not $jf) {
    $exe = 'C:\Program Files\Jellyfin\Server\jellyfin.exe'
    if (Test-Path $exe) {
        $data = "$env:LOCALAPPDATA\jellyfin-data"
        New-Item -ItemType Directory -Force $data | Out-Null
        Write-Host "Khởi động Jellyfin (datadir: $data)..."
        Start-Process -FilePath $exe -ArgumentList '--datadir', $data -WindowStyle Hidden
    } else {
        Write-Host "Không thấy $exe — cài Jellyfin trước." -ForegroundColor Yellow
    }
} else {
    Write-Host "Jellyfin đã chạy (PID $($jf.Id))"
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "Mở:  http://127.0.0.1:8096" -ForegroundColor Cyan
Write-Host "Thêm thư viện: Dashboard → Libraries → Add Media Library → chọn J:\" -ForegroundColor Cyan
Write-Host ""
Write-Host "Lưu ý: Jellyfin service (JellyfinServer) đã tắt và để Manual."
Write-Host "Đừng bật lại service, vì service không thấy ổ WebDAV J:."
