@echo off
REM ==================================================
REM  PMS [엑셀로 열기] 1회 준비 (최종)   2026-08-05
REM  더블클릭 1번이면 끝. PC마다 1회만 실행.
REM  하는 일: 1. Office 예외 등록  2. hosts에 NAS 주소 등록  3. 연결 확인
REM  NAS 방식 운영 확정 - 2026-08-04 회사 결정
REM ==================================================

REM -- 1. Office Basic 인증 예외 - 엑셀이 NAS 원본을 바로 열도록 --
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v basichostallowlist /t REG_EXPAND_SZ /d "necon-pj.synology.me" /f >nul
echo [1/3] Office 예외 등록 완료

REM -- 2. hosts 등록 - 이미 있으면 건너뜀 --
findstr /c:"necon-pj.synology.me" %windir%\System32\drivers\etc\hosts >nul 2>&1
if errorlevel 1 (
    echo [2/3] hosts 등록 - 파란 확인창이 뜨면 [예]를 눌러주세요.
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
    echo  X 아직 192.168.0.110 연결이 안 됩니다.
    echo    hosts 확인창에서 [예]를 눌렀는지 확인하고 이 파일을 한 번 더 실행하세요.
) else (
    echo.
    echo  O 준비 완료! 이제 PMS 파란 칩의 [엑셀로 열기]가 진짜 엑셀로 열립니다.
    echo    처음 열 때 로그인 창이 뜨면 NAS 계정 pms 로 로그인하세요. - 비밀번호는 별도 안내
    echo    수정 후 Ctrl+S 하면 NAS 원본에 바로 저장됩니다.
)
echo.
pause
