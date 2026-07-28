@echo off
REM ==================================================
REM  PMS [엑셀로 열기] 1회 준비   2026-07-28
REM  더블클릭 1번이면 끝. PC마다 1회만 실행.
REM  하는 일: 1. Office 예외 등록  2. hosts에 NAS 주소 등록
REM ==================================================

REM -- 1. Office Basic 인증 예외 - 현재 로그인 사용자 계정에 등록 --
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v basichostallowlist /t REG_EXPAND_SZ /d "necon-pj.synology.me" /f >nul
echo [1/3] Office 예외 등록 완료

REM -- 2. hosts 등록 - 이미 있으면 건너뜀 --
findstr /c:"necon-pj.synology.me" %windir%\System32\drivers\etc\hosts >nul 2>&1
if errorlevel 1 (
    echo [2/3] hosts 등록 - 파란 확인창이 뜨면 [예], 안랩 팝업은 [아니오]를 누르세요.
    powershell -Command "Start-Process cmd -ArgumentList '/c (echo.& echo 192.168.0.110  necon-pj.synology.me)>>%windir%\System32\drivers\etc\hosts' -Verb RunAs -Wait"
) else (
    echo [2/3] hosts 이미 등록되어 있음 - 건너뜀
)

ipconfig /flushdns >nul

REM -- 3. 연결 확인 --
echo [3/3] 연결 확인 중...
ping -n 2 necon-pj.synology.me | findstr /c:"192.168.0.110" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  X 아직 192.168.0.110 응답이 없습니다.
    echo    hosts 확인창에서 [예]를 눌렀는지 확인하고 이 파일을 한 번 더 실행하세요.
) else (
    echo.
    echo  O 준비 완료! 이제 PMS의 [엑셀로 열기]를 누르면 됩니다.
    echo    처음 한 번은 로그인 창에 전용 계정 pms 로 로그인하세요. - 비밀번호는 팀장 안내
)
echo.
pause
