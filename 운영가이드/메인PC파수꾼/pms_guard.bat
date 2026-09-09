@echo off
chcp 949 >nul
setlocal EnableExtensions
rem ============================================================
rem  PMS 메인PC 파수꾼 - PMS 전용 창이 살아 있는지 확인하고
rem  없으면 다시 띄웁니다. (작업 스케줄러가 5분마다 호출)
rem  v2 (2026-09-09): 트레이 상주 아이콘이 죽어 있으면 함께 되살립니다
rem    (창이 숨겨진 채 아이콘까지 없으면 아무도 창을 못 꺼내는 상태 방지)
rem ============================================================

set "BASE=C:\PMS"
if not exist "%BASE%\pms_config.bat" exit /b 1
call "%BASE%\pms_config.bat"
set "LOG=%BASE%\파수꾼기록.txt"

rem --- 전용 창이 떠 있는지 확인 (커맨드라인에 PMS_MainPC 표식으로 판정) ---
set "CNT=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_check.ps1"`) do set "CNT=%%A"

if not "%CNT%"=="0" goto :tray

rem --- 없으면 되살린다 ---
if not exist "%CHROME%" (
  echo [%DATE% %TIME%] 크롬을 찾지 못함: "%CHROME%">>"%LOG%"
  exit /b 1
)
echo [%DATE% %TIME%] PMS 전용 창이 없어 다시 띄웁니다.>>"%LOG%"
start "" "%CHROME%" --app=%URL% --user-data-dir="%PROFILE%" --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --disable-session-crashed-bubble --no-first-run --no-default-browser-check

:tray
rem --- 트레이 상주(pms_tray.ps1)가 살아 있는지 = 뮤텍스 PMS_MainPC_Tray 존재 여부로 판정 (자기 자신을 세는 오류 없음) ---
if not exist "%BASE%\pms_tray.ps1" exit /b 0
set "TRAY=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$m=$null; if ([System.Threading.Mutex]::TryOpenExisting('PMS_MainPC_Tray',[ref]$m)) {1} else {0}"`) do set "TRAY=%%A"
if "%TRAY%"=="0" (
  echo [%DATE% %TIME%] 트레이 아이콘이 없어 다시 띄웁니다.>>"%LOG%"
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%BASE%\pms_tray.ps1"
)
exit /b 0
