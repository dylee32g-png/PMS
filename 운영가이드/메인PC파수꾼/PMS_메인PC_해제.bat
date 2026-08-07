@echo off
chcp 949 >nul
setlocal EnableExtensions
title PMS 메인PC 파수꾼 - 해제

echo.
echo  ============================================================
echo    PMS 메인PC 파수꾼 - 해제
echo  ============================================================
echo.
echo    지우는 것 : 자동 확인 등록 2개, 바탕화면 바로가기
echo    남기는 것 : 전용 크롬 프로필 (로그인/폴더 허가증이 들어 있음)
echo                C:\PMS 폴더, 전원 설정
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo   [!] 관리자 권한이 필요합니다.
  echo       마우스 오른쪽 클릭 - "관리자 권한으로 실행"
  echo.
  pause
  exit /b 1
)

schtasks /Delete /TN "PMS_MainPC_Guard_5min"  /F >nul 2>&1
schtasks /Delete /TN "PMS_MainPC_Guard_Logon" /F >nul 2>&1
echo   - 자동 확인 등록 해제 완료
del "%USERPROFILE%\Desktop\PMS 메인PC.lnk" >nul 2>&1
echo   - 바탕화면 바로가기 삭제

echo.
echo    해제되었습니다.
echo    ※ 전원 설정(절전 안 함)은 그대로입니다.
echo       되돌리려면 : 제어판 - 전원 옵션에서 직접 바꿔주세요.
echo    ※ 전용 프로필을 완전히 지우려면 C:\PMS 폴더를 삭제하세요.
echo       (지우면 그 창의 로그인과 폴더 허가증도 함께 사라집니다)
echo.
pause
