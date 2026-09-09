' PMS 메인PC - 바탕화면 바로가기용 (v2 2026-09-09): 창이 없으면 띄우고, 숨겨져 있으면 보이게 (도스창 없이)
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""C:\PMS\pms_guard.bat""", 0, True
WScript.Sleep 4000
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\PMS\pms_tray.ps1"" -ShowOnly", 0, False
