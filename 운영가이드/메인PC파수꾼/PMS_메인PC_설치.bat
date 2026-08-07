@echo off
chcp 949 >nul
setlocal EnableExtensions
title PMS 메인PC 파수꾼 - 설치

echo.
echo  ============================================================
echo    PMS 메인PC 파수꾼 - 설치
echo  ============================================================
echo.
echo    하는 일
echo      1) C:\PMS 폴더에 파수꾼 파일을 설치합니다
echo      2) 윈도우 절전을 끕니다 (모니터만 꺼지게)
echo      3) 5분마다 / 로그온할 때 PMS 창을 자동 확인하고 없으면 되살립니다
echo      4) 바탕화면에 [PMS 메인PC] 바로가기를 만듭니다
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
echo   [1/6] 크롬 확인 : %CHROME%

rem ===== 파일 설치 =====
if not exist "%BASE%" mkdir "%BASE%"
copy /y "%SRC%pms_guard.bat"        "%BASE%\" >nul
copy /y "%SRC%pms_guard_hidden.vbs" "%BASE%\" >nul
copy /y "%SRC%pms_check.ps1"        "%BASE%\" >nul
copy /y "%SRC%mk_shortcut.vbs"      "%BASE%\" >nul
copy /y "%SRC%PMS_메인PC_해제.bat"     "%BASE%\" >nul
copy /y "%SRC%PMS_메인PC_상태보기.bat" "%BASE%\" >nul

> "%BASE%\pms_config.bat" echo set "CHROME=%CHROME%"
>>"%BASE%\pms_config.bat" echo set "URL=%URL%"
>>"%BASE%\pms_config.bat" echo set "PROFILE=%PROFILE%"
echo   [2/6] 파일 설치 : %BASE%

rem ===== 전원 설정 (전원 연결 상태 기준) =====
powercfg /change standby-timeout-ac   0  >nul 2>&1
powercfg /change hibernate-timeout-ac 0  >nul 2>&1
powercfg /change disk-timeout-ac      0  >nul 2>&1
powercfg /change monitor-timeout-ac  10  >nul 2>&1
rem USB 선택적 절전 해제
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
echo   [3/6] 전원 설정 : 절전/최대절전/디스크끄기 = 안 함, 모니터 = 10분

rem ===== 작업 스케줄러 등록 =====
schtasks /Create /TN "PMS_MainPC_Guard_5min"  /TR "wscript.exe %BASE%\pms_guard_hidden.vbs" /SC MINUTE /MO 5 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 5분 감시 등록 실패) else (echo   [4/6] 5분마다 자동 확인 등록 완료)

schtasks /Create /TN "PMS_MainPC_Guard_Logon" /TR "wscript.exe %BASE%\pms_guard_hidden.vbs" /SC ONLOGON /DELAY 0001:00 /RU "%USERNAME%" /IT /RL LIMITED /F >nul 2>&1
if errorlevel 1 (echo   [!] 로그온 감시 등록 실패) else (echo   [5/6] 로그온 1분 뒤 자동 실행 등록 완료)

rem ===== 바탕화면 바로가기 =====
cscript //nologo "%BASE%\mk_shortcut.vbs" >nul 2>&1
echo   [6/6] 바탕화면 바로가기 생성

rem ===== 즉시 1회 실행 =====
echo.
echo   PMS 전용 창을 지금 띄웁니다...
call "%BASE%\pms_guard.bat"

echo.
echo  ============================================================
echo    설치 완료
echo  ============================================================
echo.
echo    ★ 전용 창에서 아직 해주셔야 할 것 (한 번만)
echo.
echo      1. 뜬 창에서 PMS 로그인 (관리자 계정)
echo      2. 프로젝트 리스트 관리 - 기술2팀
echo      3. 폴더 지정 3개 (011 기본 / 010 기본 / 010 공용)
echo         ※ 크롬이 물어보면 반드시 [방문할 때마다 허용] 선택
echo      4. 설정 메뉴 - [이 PC를 메인 PC로 지정]
echo      5. 주소창에 chrome://settings/performance 입력
echo         - 메모리 절약 모드 끄기
echo.
echo      이 전용 창은 직원들이 쓰는 크롬과 완전히 분리돼 있습니다.
echo      직원들이 크롬을 다 닫아도 이 창은 안 죽습니다.
echo.
echo    상태 확인 : C:\PMS\PMS_메인PC_상태보기.bat
echo    되돌리기   : C:\PMS\PMS_메인PC_해제.bat
echo.
pause
