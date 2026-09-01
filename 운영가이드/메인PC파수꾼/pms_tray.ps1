param([switch]$ShowOnly, [int]$GraceMinutes = 0)
# PMS 메인PC 파수꾼 - 트레이 상주 관리자 (2026-09-01 팀장님: 작업표시줄 창을 직원들이 만짐)
#   전용 창(PMS_MainPC 크롬)을 화면/작업표시줄에서 숨기고, 시계 옆 트레이 아이콘으로만 관리한다.
#   더블클릭 = 창 보기(10분 뒤 자동 숨김) / 우클릭 = 메뉴 / -ShowOnly = 창만 다시 표시하고 종료(해제용)
#   ※ 크롬은 pms_guard.bat의 스로틀 해제 플래그로 실행되므로 숨겨도 30분 자동 반영은 계속 돈다.
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
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
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
function Show-PmsWins {
  foreach ($h in Get-PmsWins) { [void][PmsWin]::ShowWindow($h, 9); [void][PmsWin]::SetForegroundWindow($h) }   # 9 = SW_RESTORE
}
function Hide-PmsWins {
  foreach ($h in Get-PmsWins) { if ([PmsWin]::IsWindowVisible($h)) { [void][PmsWin]::ShowWindow($h, 0) } }     # 0 = SW_HIDE
}

if ($ShowOnly) { Show-PmsWins; exit }

# 중복 실행 방지 (로그온 작업이 겹쳐도 아이콘 1개만)
$mtx = New-Object System.Threading.Mutex($false, 'PMS_MainPC_Tray')
if (-not $mtx.WaitOne(0)) { exit }

$script:pauseUntil = (Get-Date).AddMinutes($GraceMinutes)   # 이 시각까지는 숨기지 않음 (설치 직후 초기 설정용)

$ni = New-Object System.Windows.Forms.NotifyIcon
try {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) { $ni.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($chrome) }
  else { $ni.Icon = [System.Drawing.SystemIcons]::Application }
} catch { $ni.Icon = [System.Drawing.SystemIcons]::Application }
$ni.Text = 'PMS 자동 반영 (더블클릭 = 창 보기)'

$showFor10 = {
  Show-PmsWins
  $script:pauseUntil = (Get-Date).AddMinutes(10)
  $ni.BalloonTipTitle = 'PMS 자동 반영'
  $ni.BalloonTipText  = '창을 열었습니다. 10분 뒤 자동으로 다시 숨겨집니다.'
  $ni.ShowBalloonTip(3000)
}
$hideNow = { $script:pauseUntil = (Get-Date); Hide-PmsWins }

$menu = New-Object System.Windows.Forms.ContextMenu
$mi1 = New-Object System.Windows.Forms.MenuItem '창 보기 (10분 뒤 자동 숨김)'
$mi1.add_Click($showFor10)
$mi2 = New-Object System.Windows.Forms.MenuItem '지금 숨기기'
$mi2.add_Click($hideNow)
$mi3 = New-Object System.Windows.Forms.MenuItem '숨김 관리 끄기 (창 다시 표시)'
$mi3.add_Click({ Show-PmsWins; $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() })
[void]$menu.MenuItems.Add($mi1); [void]$menu.MenuItems.Add($mi2); [void]$menu.MenuItems.Add('-'); [void]$menu.MenuItems.Add($mi3)
$ni.ContextMenu = $menu
$ni.add_MouseDoubleClick($showFor10)

# 10초마다: 유예 시간이 지났으면 전용 창을 숨긴다 (파수꾼이 창을 되살려도 곧 다시 숨김)
$tm = New-Object System.Windows.Forms.Timer
$tm.Interval = 10000
$tm.add_Tick({ if ((Get-Date) -gt $script:pauseUntil) { Hide-PmsWins } })
$tm.Start()

$ni.Visible = $true
if ($GraceMinutes -eq 0) { Hide-PmsWins }
[System.Windows.Forms.Application]::Run()
$ni.Visible = $false
