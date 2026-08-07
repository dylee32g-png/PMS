# PMS MainPC guard - count chrome processes of the dedicated profile
try {
  @(Get-CimInstance Win32_Process -ErrorAction Stop |
      Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*PMS_MainPC*' }).Count
} catch {
  # If the query fails, report 1 (assume alive) so we never spawn duplicate windows.
  1
}
