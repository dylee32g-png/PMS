@echo off
REM  PMS Office 2010용 [엑셀로 열기] 연결 해제   2026-08-06
REM  Office 2013 이상으로 업그레이드한 뒤 1회 실행하세요.
reg delete "HKCU\Software\Classes\ms-excel" /f >nul 2>&1
del "%APPDATA%\PMS\pms_excel2010.vbs" >nul 2>&1
del "%APPDATA%\PMS\pms_excel2010.js" >nul 2>&1
echo  O Office 2010용 연결을 제거했습니다.
echo    (Office 2013 이상을 설치했다면 정식 방식이 다시 우선됩니다)
echo.
pause
