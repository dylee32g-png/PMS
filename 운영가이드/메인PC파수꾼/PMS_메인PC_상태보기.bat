@echo off
chcp 949 >nul
setlocal EnableExtensions
title PMS 메인PC 파수꾼 - 상태 보기

set "BASE=C:\PMS"
echo.
echo  ============================================================
echo    PMS 메인PC 상태 (v2 2026-09-09)
echo  ============================================================
echo.

echo   [0] PMS 창 바로 보이기 (숨겨져 있으면 꺼냄)
set "WCNT=0"
if exist "%BASE%\pms_tray.ps1" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_tray.ps1" -ShowOnly`) do set "WCNT=%%A"
)
if "%WCNT%"=="0" (
  echo       [X] 보이는 창 없음 - 크롬 전용 창이 안 떠 있습니다. 5분 안에 파수꾼이 되살립니다
  echo           바로 띄우려면 바탕화면 [PMS 메인PC] 더블클릭
) else (
  echo       [O] 창 %WCNT%개 표시함 - 3분간 조작이 없으면 다시 시계 옆 아이콘으로 숨겨집니다
)
echo.

echo   [1] 전용 창 프로세스
set "CNT=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_check.ps1"`) do set "CNT=%%A"
if "%CNT%"=="0" (
  echo       [X] 떠 있지 않습니다  - 5분 안에 자동으로 되살아납니다
) else (
  echo       [O] 정상 실행 중
)
echo.

echo   [2] 자동 확인 등록
schtasks /Query /TN "PMS_MainPC_Guard_5min"  >nul 2>&1
if errorlevel 1 (echo       [X] 5분 감시 = 등록 안 됨) else (echo       [O] 5분마다 확인)
schtasks /Query /TN "PMS_MainPC_Guard_Logon" >nul 2>&1
if errorlevel 1 (echo       [X] 로그온 감시 = 등록 안 됨) else (echo       [O] 로그온할 때 확인)
schtasks /Query /TN "PMS_MainPC_Restart_Daily" >nul 2>&1
if errorlevel 1 (echo       [X] 새벽 재시작 = 등록 안 됨 - 설치.bat 다시 실행 필요) else (echo       [O] 매일 새벽 5:30 재시작)
schtasks /Query /TN "PMS_MainPC_Tray_Logon" >nul 2>&1
if errorlevel 1 (echo       [X] 트레이 상주 로그온 등록 = 안 됨 - 설치.bat 다시 실행 필요) else (echo       [O] 로그온 30초 뒤 트레이 상주)
echo.

echo   [3] 절전 설정 - 절전 대기 시간
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | findstr /i "AC DC"
echo       * 0x00000000 이면 "절전 안 함" 입니다 (정상)
echo.

echo   [4] 최근 부활 기록 (마지막 15줄)
if exist "%BASE%\파수꾼기록.txt" (
  powershell -NoProfile -Command "Get-Content -Tail 15 -Encoding Default 'C:\PMS\파수꾼기록.txt'"
) else (
  echo       기록 없음 - 한 번도 죽은 적이 없습니다. 좋은 신호입니다.
)
echo.

echo   [5] 트레이 아이콘 (창 자동 숨김) - 뮤텍스로 판정
set "TRAY=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$m=$null; if ([System.Threading.Mutex]::TryOpenExisting('PMS_MainPC_Tray',[ref]$m)) {1} else {0}"`) do set "TRAY=%%A"
if "%TRAY%"=="0" (
  echo       [X] 트레이 상주 없음 - 창이 작업표시줄에 그대로 보입니다. 5분 안에 파수꾼이 되살립니다
) else (
  echo       [O] 트레이 상주 중 - 시계 옆 크롬 아이콘 더블클릭 = 창 보기, 3분 조작 없으면 숨김
)
echo.
echo  ============================================================
echo.
pause
