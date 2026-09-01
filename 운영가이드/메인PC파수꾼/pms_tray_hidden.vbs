' PMS 메인PC - 트레이 상주 관리자(전용 창 숨김 + 시계 옆 아이콘) 숨김 실행 (2026-09-01)
CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\PMS\pms_tray.ps1""", 0, False
