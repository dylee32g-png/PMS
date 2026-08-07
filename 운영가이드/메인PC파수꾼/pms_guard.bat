@echo off
chcp 949 >nul
setlocal EnableExtensions
rem ============================================================
rem  PMS 메인PC 파수꾼 - PMS 전용 창이 살아 있는지 확인하고
rem  없으면 다시 띄웁니다. (작업 스케줄러가 5분마다 호출)
rem ============================================================

set "BASE=C:\PMS"
if not exist "%BASE%\pms_config.bat" exit /b 1
call "%BASE%\pms_config.bat"
set "LOG=%BASE%\파수꾼기록.txt"

rem --- 전용 창이 떠 있는지 확인 (커맨드라인의 PMS_MainPC 표식으로 구분) ---
set "CNT=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_check.ps1"`) do set "CNT=%%A"

rem --- 살아 있으면 아무것도 안 함 ---
if not "%CNT%"=="0" exit /b 0

rem --- 없으면 되살린다 ---
if not exist "%CHROME%" (
  echo [%DATE% %TIME%] 크롬을 찾지 못함: "%CHROME%">>"%LOG%"
  exit /b 1
)
echo [%DATE% %TIME%] PMS 전용 창이 없어 다시 띄웁니다.>>"%LOG%"
start "" "%CHROME%" --app=%URL% --user-data-dir="%PROFILE%" --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --disable-session-crashed-bubble --no-first-run --no-default-browser-check
exit /b 0
