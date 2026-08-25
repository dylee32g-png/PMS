' PMS 메인PC - 매일 새벽 전용 창 재시작 (검은 창 없이)
'   종료 → 3초 대기 → 파수꾼으로 새 창 = 항상 최신 배포 코드/최신 데이터로 다시 로드
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""C:\PMS\pms_restart.ps1""", 0, True
WScript.Sleep 3000
sh.Run "cmd /c ""C:\PMS\pms_guard.bat""", 0, False
