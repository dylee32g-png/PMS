@echo off
chcp 949 >nul
setlocal EnableExtensions
title PMS 메인PC 파수꾼 - 설치

echo.
echo  ============================================================
echo    PMS 메인PC 파수꾼 - 설치 (v2 2026-09-09)
echo  ============================================================
echo.
echo    하는 일
echo      1) C:\PMS 폴더에 파수꾼 파일을 설치합니다
echo      2) 절전을 끄고 화면만 10분 뒤 끕니다 (모니터만 꺼짐)
echo      3) 5분마다 / 로그온할 때 PMS 창을 자동 확인하고 없으면 되살립니다
echo      4) 매일 새벽 5:30 전용 창을 자동 재시작합니다 (최신 배포/최신 데이터 반영)
echo      5) 바탕화면에 [PMS 메인PC] 바로가기를 만듭니다
echo      6) PMS 창을 바로 띄우고, 3분간 조작이 없으면 시계 옆 아이콘으로 숨깁니다
echo.
echo    되돌리기 : PMS_메인PC_해제.bat
echo  ------------------------------------------------------------
echo.

rem ===== 관리자 권한 확인 =====
net session >nul 2>&1
if errorlevel 1 (
  echo   [!] 관리자 권한이 필요합니다.
  echo.
  echo       이 파일을 마우스 오른쪽 클릭 - "관리자 권한으로 실행"
  echo       으로 다시 열어주세요.
  echo.
  pause
  exit /b 1
)

set "SRC=%~dp0"
set "BASE=C:\PMS"
set "URL=https://neconsys.web.app"
set "PROFILE=%BASE%\ChromeProfile_PMS_MainPC"

rem ===== 크롬 찾기 =====
set "CHROME="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do if not defined CHROME if exist %%P set "CHROME=%%~P"

if not defined CHROME (
  echo   [!] 크롬을 찾지 못했습니다.
  echo       크롬을 설치한 뒤 다시 실행해주세요.
  echo.
  pause
  exit /b 1
)
echo   [1/8] 크롬 확인 : %CHROME%

rem ===== 파일 설치 =====
if not exist "%BASE%" mkdir "%BASE%"
copy /y "%SRC%pms_guard.bat"          "%BASE%\" >nul
copy /y "%SRC%pms_guard_hidden.vbs"   "%BASE%\" >nul
copy /y "%SRC%pms_check.ps1"          "%BASE%\" >nul
copy /y "%SRC%pms_restart.ps1"        "%BASE%\" >nul
copy /y "%SRC%pms_restart_hidden.vbs" "%BASE%\" >nul
copy /y "%SRC%pms_tray.ps1"           "%BASE%\" >nul
copy /y "%SRC%pms_tray_hidden.vbs"    "%BASE%\" >nul
copy /y "%SRC%pms_show_hidden.vbs"    "%BASE%\" >nul
copy /y "%SRC%mk_shortcut.vbs"        "%BASE%\" >nul
copy /y "%SRC%PMS_메인PC_해제.bat"     "%BASE%\" >nul
copy /y "%SRC%PMS_메인PC_상태보기.bat" "%BASE%\" >nul

> "%BASE%\pms_config.bat" echo set "CHROME=%CHROME%"
>>"%BASE%\pms_config.bat" echo set "URL=%URL%"
>>"%BASE%\pms_config.bat" echo set "PROFILE=%PROFILE%"
echo   [2/8] 파일 설치 : %BASE%

rem ===== 절전 해제 (전원 연결 상태 기준) =====
powercfg /change standby-timeout-ac   0  >nul 2>&1
powercfg /change hibernate-timeout-ac 0  >nul 2>&1
powercfg /change disk-timeout-ac      0  >nul 2>&1
powercfg /change monitor-timeout-ac  10  >nul 2>&1
rem USB 선택적 절전 해제
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
echo   [3/8] 절전 해제 : 절전/최대절전/디스크 = 안 함, 모니터 = 10분

rem ===== 작업 스케줄러 등록 =====
schtasks /Create /TN "PMS_MainPC_Guard_5min"  /TR "wscript.exe %BASE%\pms_guard_hidden.vbs" /SC MINUTE /MO 5 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 5분 감시 등록 실패) else (echo   [4/8] 5분마다 자동 확인 등록 완료)

schtasks /Create /TN "PMS_MainPC_Guard_Logon" /TR "wscript.exe %BASE%\pms_guard_hidden.vbs" /SC ONLOGON /DELAY 0001:00 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 로그온 감시 등록 실패) else (echo   [5/8] 로그온 1분 뒤 자동 실행 등록 완료)

rem 새벽 자동 재시작 (2026-08-25 신설) - 항상 켜진 창은 스스로 새로고침을 안 해서,
rem 배포 후 옛 코드/재적재 후 옛 데이터로 계속 돌며 지운 행을 되살릴 수 있음 - 하루 1회 새 창으로 교체
schtasks /Create /TN "PMS_MainPC_Restart_Daily" /TR "wscript.exe %BASE%\pms_restart_hidden.vbs" /SC DAILY /ST 05:30 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 새벽 재시작 등록 실패) else (echo   [6/8] 매일 새벽 5:30 자동 재시작 등록 완료)

rem 트레이 상주 (2026-09-01, v2 2026-09-09) - 로그온 30초 뒤 시계 옆 아이콘 상주.
rem   v2: 창은 보인 채로 시작, 3분간 키보드/마우스 조작이 없으면 화면·작업표시줄에서 숨김 (더블클릭 = 창 보기)
schtasks /Create /TN "PMS_MainPC_Tray_Logon" /TR "wscript.exe %BASE%\pms_tray_hidden.vbs" /SC ONLOGON /DELAY 0000:30 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 트레이 상주 등록 실패) else (echo   [6-1] 트레이 상주 - 창 자동 숨김 등록 완료)

rem ===== 바탕화면 바로가기 =====
cscript //nologo "%BASE%\mk_shortcut.vbs" >nul 2>&1
echo   [7/8] 바탕화면 바로가기 생성 (더블클릭 = PMS 창 바로 보이기)

rem ===== 즉시 실행: 창을 바로 띄우고 트레이 상주 시작 (v2 2026-09-09) =====
echo.
echo   PMS 전용 창을 띄웁니다... (몇 초 걸립니다)
rem 1) 옛 트레이 상주 종료 (숨김 규칙이 바뀐 새 스크립트로 교체)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*pms_tray.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
rem 2) 창이 없으면 새로 띄우기 (있으면 그대로) + 트레이 상주 시작
call "%BASE%\pms_guard.bat"
timeout /t 6 /nobreak >nul
rem 3) 숨겨져 있던 창이면 보이게 하고, 보이는 창 개수 확인
set "WCNT=0"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_tray.ps1" -ShowOnly`) do set "WCNT=%%A"
if "%WCNT%"=="0" (
  rem 크롬 프로세스는 있는데 창이 없는 먹통 상태 - 전용 창만 닫고 새로 띄움. 다른 크롬은 안 건드림
  echo   [!] 창이 보이지 않아 전용 창을 닫고 새로 띄웁니다...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_restart.ps1" >nul 2>&1
  timeout /t 3 /nobreak >nul
  call "%BASE%\pms_guard.bat"
  timeout /t 8 /nobreak >nul
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%\pms_tray.ps1" -ShowOnly`) do set "WCNT=%%A"
)
if "%WCNT%"=="0" (
  echo   [!] 창을 띄우지 못했습니다. 크롬 설치 상태를 확인한 뒤 다시 실행해주세요.
) else (
  echo   [8/8] PMS 창 표시 완료 - 창 %WCNT%개
)
rem 4) 트레이 상주 보장 (guard가 이미 띄웠으면 뮤텍스로 1개만 유지)
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%BASE%\pms_tray.ps1"
echo   [+] 트레이 상주 시작 (시계 옆 크롬 아이콘) - 3분간 조작이 없으면 창이 자동으로 숨겨집니다

echo.
echo  ============================================================
echo    설치 완료
echo  ============================================================
echo.
echo    지금 뜬 PMS 창에서 직접 해주셔야 할 것 (한 번만)
echo.
echo      1. PMS 로그인 (관리자 계정)
echo      2. 기술1팀,2팀,3팀 List 각각 - 설정 - [이 PC를 메인 PC로 지정]
echo         (3팀 순환 자동 반영)
echo      3. 기술2팀 List에서 폴더 지정 3곳 (011 기본 / 010 기본 / 010 공용)
echo         - 관리 칸 보라색 NAS 칩 클릭 - 창에서 [폴더 지정]
echo         * 크롬이 물으면 반드시 [방문할 때마다 허용] 선택
echo      4. 설정 - [자동 백업 폴더 지정 (이 PC, 매일)] - NAS 백업 폴더 선택
echo         (배포본에 이 메뉴가 있을 때. 3팀 전체 백업이 매일 06시 이후 자동 저장)
echo      5. 주소창에 chrome://settings/performance 입력
echo         - 메모리 절약 모드 끄기
echo      6. 다 했으면 공용 계정으로 다시 로그인해 두기 (관리자 계정 상주 금지)
echo.
echo    * 이 창은 3분간 키보드/마우스 조작이 없으면 화면과 작업표시줄에서 사라지고
echo      시계 옆 크롬 아이콘으로만 남습니다. (작업 중에는 절대 안 숨겨짐)
echo      다시 보려면 : 시계 옆 아이콘 더블클릭 / 바탕화면 [PMS 메인PC] / 상태보기.bat
echo    * 직원들이 크롬을 다 닫아도 이 창은 안 닫힙니다 (전용 창은 별도 프로필).
echo.
echo    상태 확인 : C:\PMS\PMS_메인PC_상태보기.bat
echo    되돌리기   : C:\PMS\PMS_메인PC_해제.bat
echo.
pause
