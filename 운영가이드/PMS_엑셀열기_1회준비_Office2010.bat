@echo off
REM ==================================================
REM  PMS [엑셀로 열기] 1회 준비 - Office 2010 전용 v3   2026-08-06
REM  Excel 2013 이상 PC는 기존 PMS_엑셀열기_1회준비.bat 을 쓰세요.
REM  v3: 긴 한글 경로를 P: 드라이브로 접어서 열기
REM      - 2010의 경로 제한(한글=2자 계산, 총 218) 회피
REM  되돌리기: PMS_엑셀열기_Office2010_해제.bat
REM ==================================================

REM -- 1. Excel 2010 (Office14) 위치 확인 --
set "EXL=C:\Program Files (x86)\Microsoft Office\Office14\EXCEL.EXE"
if not exist "%EXL%" set "EXL=C:\Program Files\Microsoft Office\Office14\EXCEL.EXE"
if not exist "%EXL%" goto NOEXCEL
echo [1/5] Excel 2010 확인 완료
set "EXLJ=%EXL:\=\\%"

REM -- 2. 여는 도우미(통역사 v3) 설치 --
set "PMSDIR=%APPDATA%\PMS"
if not exist "%PMSDIR%" mkdir "%PMSDIR%"
del "%PMSDIR%\pms_excel2010.vbs" >nul 2>&1
set "JS=%PMSDIR%\pms_excel2010.js"
> "%JS%" echo var a = WScript.Arguments(0);
>> "%JS%" echo var bar = String.fromCharCode(124);
>> "%JS%" echo a = a.split('%%7C').join(bar);
>> "%JS%" echo a = a.split('%%7c').join(bar);
>> "%JS%" echo var p = a.toLowerCase().indexOf(bar + 'u' + bar);
>> "%JS%" echo var u = (p + 1) ? a.substring(p + 3) : a;
>> "%JS%" echo u = u.split('%%3A').join(':');
>> "%JS%" echo u = u.split('%%3a').join(':');
>> "%JS%" echo u = u.split('%%2F').join('/');
>> "%JS%" echo u = u.split('%%2f').join('/');
>> "%JS%" echo if (u.toLowerCase().indexOf('https') != 0) WScript.Quit();
>> "%JS%" echo var i = u.indexOf('/', 8);
>> "%JS%" echo if (i + 1 == 0) WScript.Quit();
>> "%JS%" echo var rel = '';
>> "%JS%" echo try { rel = decodeURIComponent(u.substring(i + 1)); } catch (e) { WScript.Quit(); }
>> "%JS%" echo var bs = String.fromCharCode(92);
>> "%JS%" echo rel = rel.split('/').join(bs);
>> "%JS%" echo var unc = bs + bs + '192.168.0.110' + bs + rel;
>> "%JS%" echo var use = unc;
>> "%JS%" echo var fso = new ActiveXObject('Scripting.FileSystemObject');
>> "%JS%" echo var pref = (bs + bs + '192.168.0.110' + bs + 'NECONSYS_PJ' + bs + '001 Project' + bs + '001 파주' + bs + '107 기술2팀 2026년 Project' + bs).toLowerCase();
>> "%JS%" echo try {
>> "%JS%" echo if (unc.toLowerCase().indexOf(pref) == 0) {
>> "%JS%" echo var short2 = 'P:' + bs + unc.substring(pref.length);
>> "%JS%" echo if (fso.FileExists(short2)) use = short2;
>> "%JS%" echo }
>> "%JS%" echo } catch (e3) { }
>> "%JS%" echo try {
>> "%JS%" echo var dir = fso.GetParentFolderName(WScript.ScriptFullName);
>> "%JS%" echo var lg = fso.CreateTextFile(dir + bs + 'last_open.txt', true, true);
>> "%JS%" echo lg.WriteLine(use);
>> "%JS%" echo lg.WriteLine(fso.FileExists(use) ? 'EXISTS' : 'NOT-FOUND');
>> "%JS%" echo lg.Close();
>> "%JS%" echo } catch (e2) { }
>> "%JS%" echo var ex = '%EXLJ%';
>> "%JS%" echo var qq = String.fromCharCode(34);
>> "%JS%" echo var sh = new ActiveXObject('WScript.Shell');
>> "%JS%" echo sh.Run(qq + ex + qq + ' ' + qq + use + qq, 1, false);
echo [2/5] 여는 도우미 설치 완료

REM -- 3. ms-excel 신호를 도우미에 연결 (이 사용자만, 관리자 불필요) --
reg add "HKCU\Software\Classes\ms-excel" /ve /d "URL:ms-excel" /f >nul
reg add "HKCU\Software\Classes\ms-excel" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\ms-excel\shell\open\command" /ve /t REG_SZ /d "wscript.exe \"%JS%\" \"%%1\"" /f >nul
echo [3/5] 브라우저-엑셀 연결 등록 완료

REM -- 4. P: 드라이브 연결 (긴 한글 경로 접기용) --
if exist P:\ goto PDONE
net use P: "\\192.168.0.110\NECONSYS_PJ\001 Project\001 파주\107 기술2팀 2026년 Project" /persistent:yes >nul 2>&1
if exist P:\ goto PDONE
echo [4/5] P: 연결 실패 - VPN 연결 상태에서 탐색기로
echo        \\192.168.0.110\NECONSYS_PJ 를 한 번 열어 로그인한 뒤
echo        이 파일을 다시 실행해 주세요. (일단 계속 진행합니다)
goto PSKIP
:PDONE
echo [4/5] P: 드라이브 연결 완료
:PSKIP

REM -- 5. hosts 확인 - 이미 있으면 건너뜀 --
findstr /c:"necon-pj.synology.me" %windir%\System32\drivers\etc\hosts >nul 2>&1
if errorlevel 1 (
    echo [5/5] hosts 등록 - 파란 확인창이 뜨면 [예]를 눌러주세요.
    powershell -Command "Start-Process cmd -ArgumentList '/c (echo.& echo 192.168.0.110  necon-pj.synology.me)>>%windir%\System32\drivers\etc\hosts' -Verb RunAs -Wait"
) else (
    echo [5/5] hosts 이미 등록되어 있음 - 건너뜀
)
ipconfig /flushdns >nul

echo.
echo  O 준비 완료! 크롬을 완전히 껐다가 다시 켠 뒤 PMS [엑셀로 열기]를 눌러보세요.
echo    ※ 사무실 밖에서는 VPN을 먼저 연결해야 합니다.
echo    ※ Office 2013 이상으로 바꾸면 해제.bat 을 한 번 실행해 주세요.
echo.
pause
exit /b

:NOEXCEL
echo  X Excel 2010(Office14)을 찾지 못했습니다. 이 파일은 Office 2010 PC 전용입니다.
echo    Excel 2013 이상이면 기존 PMS_엑셀열기_1회준비.bat 을 쓰세요.
echo.
pause
