@echo off
REM ==================================================
REM  PMS [엑셀로 열기] 1회 준비 (최종)   2026-08-10
REM  더블클릭 1번이면 끝. PC마다 1회만 실행.
REM  하는 일: 1.엑셀 버전 확인  2.Office 예외 등록  3.오피스365 인증 끄기
REM           4.hosts에 NAS 주소 등록  5.연결 확인
REM  NAS 방식 운영 확정 - 2026-08-04 회사 결정
REM  2026-08-10 : 엑셀 버전 자동 확인 + Office 2013(15.0) 등록 추가
REM  2026-08-10 : 오피스365 계정을 넣었던 PC 대응 - 3단계 신설
REM               (실측: 365 계정 넣은 PC만 [엑셀로 열기] 실패, 안 넣은 PC는 정상)
REM  되돌리기(오피스365를 다시 쓸 때) - 아래 2줄을 실행:
REM    reg delete "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v EnableADAL /f
REM    reg delete "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v SignedOutADUser /f
REM ==================================================

echo.
echo  === PMS [엑셀로 열기] 1회 준비 ===
echo.

REM -- 1. 이 PC의 엑셀 버전 확인 - Office 2010은 다른 파일을 써야 함 --
set XLVER=none
for /f "tokens=3" %%a in ('reg query HKCR\Excel.Application\CurVer /ve 2^>nul') do set XLVER=%%a

if "%XLVER%"=="none" (
    echo  [1/5] 엑셀 버전 - 확인 못 함. 엑셀이 설치돼 있는지 확인하세요.
    echo        일단 등록은 그대로 진행합니다.
    goto STEP2
)

set XLNUM=%XLVER:Excel.Application.=%
if "%XLNUM%"=="14" goto O2010
if "%XLNUM%"=="15" echo  [1/5] 이 PC의 엑셀 = Office 2013
if "%XLNUM%"=="16" echo  [1/5] 이 PC의 엑셀 = Office 2016 / 2019 / 2021 / 365
if not "%XLNUM%"=="14" if not "%XLNUM%"=="15" if not "%XLNUM%"=="16" echo  [1/5] 이 PC의 엑셀 = %XLVER%
goto STEP2

:O2010
echo  [1/5] 이 PC의 엑셀 = Office 2010
echo.
echo  !! Office 2010은 [엑셀로 열기] 신호를 원천적으로 받지 못합니다.
echo     이 파일 대신 아래 파일을 실행하세요 (같은 폴더에 있습니다):
echo.
echo        PMS_엑셀열기_1회준비_Office2010.bat
echo.
pause
exit /b

:STEP2
REM -- 2. Office Basic 인증 예외 - 버전별 등록 위치가 달라 2013(15.0) / 2016+(16.0) 둘 다 --
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v basichostallowlist /t REG_EXPAND_SZ /d "necon-pj.synology.me" /f >nul
reg add "HKCU\Software\Microsoft\Office\15.0\Common\Identity" /v basichostallowlist /t REG_EXPAND_SZ /d "necon-pj.synology.me" /f >nul
echo  [2/5] Office 예외 등록 완료 - 2013 / 2016 / 2019 / 2021 / 365 전부

REM -- 3. 오피스365(조직 계정) 인증 끄기 --
REM    365 계정을 한 번이라도 넣은 PC는 Office가 조직 계정 인증만 시도하고
REM    NAS의 아이디/비번 로그인으로 되돌아가지 않아 [엑셀로 열기]가 막힌다.
REM    365를 안 쓴 PC에는 아무 영향이 없다 (조직 계정 자체가 없으므로).
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v EnableADAL /t REG_DWORD /d 0 /f >nul
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Identity" /v SignedOutADUser /t REG_DWORD /d 1 /f >nul
reg add "HKCU\Software\Microsoft\Office\15.0\Common\Identity" /v EnableADAL /t REG_DWORD /d 0 /f >nul
reg add "HKCU\Software\Microsoft\Office\15.0\Common\Identity" /v SignedOutADUser /t REG_DWORD /d 1 /f >nul
echo  [3/5] 오피스365 인증 끄기 완료 - 365 계정을 썼던 PC도 NAS 원본이 열립니다

REM -- 4. hosts 등록 - 이미 있으면 건너뜀 --
findstr /c:"necon-pj.synology.me" %windir%\System32\drivers\etc\hosts >nul 2>&1
if errorlevel 1 (
    echo  [4/5] hosts 등록 - 파란 확인창이 뜨면 [예]를 눌러주세요.
    powershell -Command "Start-Process cmd -ArgumentList '/c (echo.& echo 192.168.0.110  necon-pj.synology.me)>>%windir%\System32\drivers\etc\hosts' -Verb RunAs -Wait"
) else (
    echo  [4/5] hosts 이미 등록되어 있음 - 건너뜀
)

ipconfig /flushdns >nul

REM -- 5. 연결 확인 --
echo  [5/5] 연결 확인 중...
ping -n 2 necon-pj.synology.me | findstr /c:"192.168.0.110" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  X 아직 192.168.0.110 연결이 안 됩니다.
    echo    - hosts 확인창에서 [예]를 눌렀는지 확인하고 이 파일을 한 번 더 실행하세요.
    echo    - 사무실 밖이라면 VPN을 먼저 연결한 뒤 다시 실행하세요.
) else (
    echo.
    echo  O 준비 완료! 이제 PMS 파란 칩의 [엑셀로 열기]가 진짜 엑셀로 열립니다.
    echo.
    echo    ** 중요 ** 지금 켜져 있는 엑셀은 모두 완전히 닫았다가 다시 여세요.
    echo               등록한 내용은 엑셀이 새로 켜질 때 읽힙니다.
    echo               (작업 표시줄에 없어도 백그라운드에 남을 수 있습니다 -
    echo                Ctrl+Shift+Esc 작업 관리자에서 EXCEL.EXE 를 끝내면 확실합니다)
    echo.
    echo    처음 열 때 로그인 창이 뜨면 NAS 계정 pms 로 로그인하세요. - 비밀번호는 별도 안내
    echo    수정 후 Ctrl+S 하면 NAS 원본에 바로 저장됩니다.
)
echo.
pause
