' Chạy start-perkeep-jellyfin.ps1 ẩn hoàn toàn (không hiện cửa sổ PowerShell).
' Được gọi từ shortcut trong shell:startup.
Set objShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1 = scriptDir & "\start-perkeep-jellyfin.ps1"
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
