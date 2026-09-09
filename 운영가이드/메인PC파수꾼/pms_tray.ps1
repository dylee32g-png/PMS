param([switch]$ShowOnly, [int]$IdleMinutes = 3)
# PMS 메인PC 파수꾼 - 트레이 상주 아이콘 v2 (2026-09-09 팀장님)
#   "설치하면 창이 바로 뜨고, 3분간 조작이 없으면 시계 옆 아이콘으로 숨겨져 백그라운드로 돈다"
#   · v1(9/1)은 시작하자마자 창을 숨기고(유예 0분) 설치.bat도 숨겨진 창을 다시 보여주지 않아 '아무 반응 없음'이 됐다.
#   · v2: 켜질 때 창을 '보인 채로' 시작. 숨김 기준 = 고정 시간이 아니라 '마지막 키보드/마우스 조작 후 N분'(GetLastInputInfo).
#     → 사람이 만지는 동안엔 절대 안 숨고, 손을 떼고 3분 지나면 화면·작업표시줄에서 사라져 트레이 아이콘만 남는다.
#   · 더블클릭 = 창 보이기 (또 3분 조작 없으면 숨김) / 우클릭 = 메뉴 / -ShowOnly = 창만 보이고 '보이는 창 개수'를 출력한 뒤 종료
#   · 중복 실행 방지 = 뮤텍스 PMS_MainPC_Tray (guard.bat·상태보기.bat가 '트레이 살아있나'를 이 뮤텍스로 판정)
#   ※ 크롬은 pms_guard.bat의 스로틀 해제 플래그로 실행되므로 숨겨도 30분 자동 반영·자동 백업은 그대로 돈다.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic; using System.Text;
public class PmsWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint IdleMs() {
    var li = new LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref li)) return 0;
    return unchecked((uint)Environment.TickCount - li.dwTime);
  }
  public static List<IntPtr> Find(HashSet<uint> pids) {
    var found = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      if (GetWindowTextLength(h) == 0) return true;
      var sb = new StringBuilder(64); GetClassName(h, sb, 64);
      if (!sb.ToString().StartsWith("Chrome_WidgetWin")) return true;
      found.Add(h); return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

function Get-PmsWins {
  $set = New-Object 'System.Collections.Generic.HashSet[uint32]'
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*PMS_MainPC*' } |
    ForEach-Object { [void]$set.Add([uint32]$_.ProcessId) }
  if ($set.Count -eq 0) { return @() }
  return @([PmsWin]::Find($set))
}
function Show-PmsWins {   # 숨김/최소화 상태면 복원해서 앞으로. 보이는 창 개수 반환
  $n = 0
  foreach ($h in Get-PmsWins) {
    if (-not [PmsWin]::IsWindowVisible($h) -or [PmsWin]::IsIconic($h)) { [void][PmsWin]::ShowWindow($h, 9) }   # 9 = SW_RESTORE
    else { [void][PmsWin]::ShowWindow($h, 5) }                                                                  # 5 = SW_SHOW
    [void][PmsWin]::SetForegroundWindow($h); $n++
  }
  return $n
}
function Hide-PmsWins {
  foreach ($h in Get-PmsWins) { if ([PmsWin]::IsWindowVisible($h)) { [void][PmsWin]::ShowWindow($h, 0) } }     # 0 = SW_HIDE
}
function Test-AnyVisible {
  foreach ($h in Get-PmsWins) { if ([PmsWin]::IsWindowVisible($h)) { return $true } }
  return $false
}

if ($ShowOnly) { Write-Output (Show-PmsWins); exit }

# 중복 실행 방지 (로그온 작업과 설치.bat가 겹쳐도 아이콘 1개만)
$mtx = New-Object System.Threading.Mutex($false, 'PMS_MainPC_Tray')
if (-not $mtx.WaitOne(0)) { exit }

$idleLimitMs = [Math]::Max(1, $IdleMinutes) * 60000

$ni = New-Object System.Windows.Forms.NotifyIcon
try {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) { $ni.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($chrome) }
  else { $ni.Icon = [System.Drawing.SystemIcons]::Application }
} catch { $ni.Icon = [System.Drawing.SystemIcons]::Application }
$ni.Text = "PMS 메인PC 자동 반영 (더블클릭 = 창 보기, ${IdleMinutes}분 조작 없으면 자동 숨김)"

$showNow = {
  [void](Show-PmsWins)
  $ni.BalloonTipTitle = 'PMS 메인PC'
  $ni.BalloonTipText  = "창을 보였습니다. ${IdleMinutes}분간 조작이 없으면 시계 옆 아이콘으로 다시 숨겨집니다."
  $ni.ShowBalloonTip(3000)
}
$hideNow = { Hide-PmsWins }

$menu = New-Object System.Windows.Forms.ContextMenu
$mi1 = New-Object System.Windows.Forms.MenuItem "창 보이기 (${IdleMinutes}분 조작 없으면 자동 숨김)"
$mi1.add_Click($showNow)
$mi2 = New-Object System.Windows.Forms.MenuItem '지금 숨기기'
$mi2.add_Click($hideNow)
$mi3 = New-Object System.Windows.Forms.MenuItem '트레이 상주 종료 (창 다시 표시)'
$mi3.add_Click({ [void](Show-PmsWins); $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() })
[void]$menu.MenuItems.Add($mi1); [void]$menu.MenuItems.Add($mi2); [void]$menu.MenuItems.Add('-'); [void]$menu.MenuItems.Add($mi3)
$ni.ContextMenu = $menu
$ni.add_MouseDoubleClick($showNow)

# 10초마다: 창이 보이는 상태 + 마지막 조작 후 N분 경과 → 숨김. (파수꾼이 새 창을 띄우거나 새벽 재시작으로 새 창이 떠도 같은 규칙으로 정리)
$tm = New-Object System.Windows.Forms.Timer
$tm.Interval = 10000
$tm.add_Tick({
  try { if ((Test-AnyVisible) -and ([PmsWin]::IdleMs() -ge $idleLimitMs)) { Hide-PmsWins } } catch {}
})
$tm.Start()

$ni.Visible = $true
[void](Show-PmsWins)   # v2: 시작은 '보이는 상태'로 (설치 직후 관리자가 로그인·설정할 수 있게)
[System.Windows.Forms.Application]::Run()
$ni.Visible = $false
