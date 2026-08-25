# PMS MainPC - close ONLY the dedicated-profile chrome window (daily fresh restart).
# Why: the always-on window never reloads by itself, so it keeps running OLD app code
#      after a deploy and OLD data after a re-upload (stale saves can resurrect deleted rows).
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*PMS_MainPC*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
