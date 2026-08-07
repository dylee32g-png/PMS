@echo off
chcp 949 >nul
setlocal EnableExtensions
title PMS 메인PC 파수꾼 - 상태 보기

set "BASE=C:\PMS"
echo.
echo  ============================================================
echo    PMS 메인PC 상태
echo  ============================================================
echo.

echo   [1] 전용 창
set "CNT=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_check.ps1"`) do set "CNT=%%A"
if "%CNT%"=="0" (
  echo       [X] 지금 떠 있지 않습니다  - 5분 안에 자동으로 되살아납니다
) else (
  echo       [O] 정상 동작 중
)
echo.

echo   [2] 자동 확인 등록
schtasks /Query /TN "PMS_MainPC_Guard_5min"  >nul 2>&1
if errorlevel 1 (echo       [X] 5분 감시 = 등록 안 됨) else (echo       [O] 5분마다 확인)
schtasks /Query /TN "PMS_MainPC_Guard_Logon" >nul 2>&1
if errorlevel 1 (echo       [X] 로그온 감시 = 등록 안 됨) else (echo       [O] 로그온할 때 확인)
echo.

echo   [3] 전원 설정 - 절전 대기 시간
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | findstr /i "AC DC"
echo       ※ 0x00000000 이면 "절전 안 함" 입니다 (정상)
echo.

echo   [4] 최근 부활 기록 (마지막 15줄)
if exist "%BASE%\파수꾼기록.txt" (
  powershell -NoProfile -Command "Get-Content -Tail 15 -Encoding Default 'C:\PMS\파수꾼기록.txt'"
) else (
  echo       기록 없음 - 한 번도 꺼진 적이 없습니다. 좋은 신호입니다.
)
echo.
echo  ============================================================
echo.
pause
