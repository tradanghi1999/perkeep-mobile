# Nâng giới hạn WebDAV của Windows để Jellyfin đọc được video lớn qua ổ ảo.
# Chạy: chuột phải file này -> "Run with PowerShell" với quyền Administrator
# (hoặc mở PowerShell as Admin rồi:  cd <thư mục dự án>; .\scripts\setup-webdav-admin.ps1)

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())
        .IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Cần quyền Administrator. Đang mở lại PowerShell với quyền admin..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
    exit
}

$key = 'HKLM:\SYSTEM\CurrentControlSet\Services\WebClient\Parameters'

Write-Host "1) Nâng FileSizeLimitInBytes lên 4GB..."
Set-ItemProperty $key -Name FileSizeLimitInBytes -Value 4294967295 -Type DWord
Write-Host "   OK" -ForegroundColor Green

Write-Host "2) Nâng Timeout (giây) cho file lớn..."
Set-ItemProperty $key -Name FileAttributesLimitInBytes -Value 1000000 -Type DWord -ErrorAction SilentlyContinue
Write-Host "   OK" -ForegroundColor Green

Write-Host "3) Khởi động lại dịch vụ WebClient..."
Restart-Service WebClient -Force
Start-Sleep -Seconds 2
Write-Host "   Trạng thái: $((Get-Service WebClient).Status)" -ForegroundColor Green

Write-Host ""
Write-Host "Xong. Giờ map lại ổ đĩa (nếu chưa map):" -ForegroundColor Cyan
Write-Host "   net use J: http://127.0.0.1:8099/ /persistent:yes"
Write-Host ""
Write-Host "Nhớ chạy gateway trước:  bun run scripts/jellyfin-gateway.mjs"
Write-Host "Rồi trong Jellyfin: Dashboard -> Libraries -> Add Media Library -> chọn J:\"
Read-Host "Nhấn Enter để đóng"
