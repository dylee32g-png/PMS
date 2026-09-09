' PMS 메인PC - 바탕화면 바로가기 생성 (v2 2026-09-09: 더블클릭 = 창이 없으면 띄우고, 숨겨져 있으면 바로 보이기)
Set sh = CreateObject("WScript.Shell")
Set lnk = sh.CreateShortcut(sh.SpecialFolders("Desktop") & "\PMS 메인PC.lnk")
lnk.TargetPath       = "wscript.exe"
lnk.Arguments        = """C:\PMS\pms_show_hidden.vbs"""
lnk.WorkingDirectory = "C:\PMS"
lnk.Description      = "PMS 메인PC 전용 창 보이기 (없으면 띄움, 숨겨져 있으면 꺼냄. 3분 조작 없으면 자동 숨김)"
lnk.IconLocation     = "C:\Program Files\Google\Chrome\Application\chrome.exe, 0"
lnk.Save
