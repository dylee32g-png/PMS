' PMS 메인PC - 바탕화면 바로가기 생성
Set sh = CreateObject("WScript.Shell")
Set lnk = sh.CreateShortcut(sh.SpecialFolders("Desktop") & "\PMS 메인PC.lnk")
lnk.TargetPath       = "wscript.exe"
lnk.Arguments        = """C:\PMS\pms_guard_hidden.vbs"""
lnk.WorkingDirectory = "C:\PMS"
lnk.Description      = "PMS 메인PC 전용 창 (없으면 띄우고, 떠 있으면 아무 일도 안 함)"
lnk.IconLocation     = "C:\Program Files\Google\Chrome\Application\chrome.exe, 0"
lnk.Save
