# Claude Code 「Stop」 훅 — 답변이 끝나면 팝업으로 알린다.
#
# 팝업을 **떼어 낸 프로세스**에서 띄우는 이유: 훅은 명령이 끝날 때까지 Claude Code를
# 붙잡아 둔다. 이 스크립트 안에서 폼을 그대로 띄우면 사람이 [확인]을 누를 때까지
# 다음 입력이 막히고, 타임아웃까지 걸리면 훅이 실패로 기록된다.
# 그래서 여기서는 창을 띄우라고 시키기만 하고 즉시 빠져나온다.
#
# 이 파일은 반드시 BOM 있는 UTF-8로 저장할 것 — Windows PowerShell 5.1은 BOM이
# 없으면 스크립트 파일을 시스템 코드페이지로 읽어서 한글이 깨진다.

$ErrorActionPreference = 'SilentlyContinue'

# 훅 페이로드(JSON)가 stdin으로 들어온다. 쓰지 않더라도 읽어서 파이프를 비워 준다.
$null = [Console]::In.ReadToEnd()

$where = Split-Path -Leaf (Get-Location)
$when  = Get-Date -Format 'HH:mm:ss'
$body  = "답변이 끝났습니다.`n`n$where  ·  $when"

# 따옴표가 섞여도 깨지지 않도록 -EncodedCommand로 넘긴다.
# (중첩 -Command 문자열은 인용 부호를 세 번 벗겨야 해서 한글·줄바꿈에서 잘 깨진다)
#
# MessageBox 대신 직접 만든 폼을 쓰는 이유: VS Code로 포커스가 돌아오면 자동으로
# 닫고 싶은데, MessageBox는 진짜 대화상자 창을 PowerShell 코드가 붙잡을 수 없어서
# 타이머에서 닫을 방법이 없다. 직접 만든 Form은 참조를 들고 있으니 타이머 틱에서
# 바로 .Close()를 부르면 된다 — ShowDialog() 중에도 같은 스레드의 Timer는 계속 돈다.
$inner = @"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ClaudeNotifyFocus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
'@

`$form = New-Object System.Windows.Forms.Form
`$form.Text = 'Claude Code'
`$form.StartPosition = 'CenterScreen'
`$form.TopMost = `$true
`$form.FormBorderStyle = 'FixedDialog'
`$form.MaximizeBox = `$false
`$form.MinimizeBox = `$false
`$form.ClientSize = New-Object System.Drawing.Size(320, 130)

`$label = New-Object System.Windows.Forms.Label
`$label.Text = @'
$body
'@
`$label.AutoSize = `$false
`$label.Size = New-Object System.Drawing.Size(280, 70)
`$label.Location = New-Object System.Drawing.Point(20, 15)
`$form.Controls.Add(`$label)

`$ok = New-Object System.Windows.Forms.Button
`$ok.Text = '확인'
`$ok.Size = New-Object System.Drawing.Size(80, 26)
`$ok.Location = New-Object System.Drawing.Point(220, 90)
`$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
`$form.AcceptButton = `$ok
`$form.Controls.Add(`$ok)

# VS Code로 포커스가 돌아온 순간을 감지해 닫는다. 여러 개가 쌓여 있어도
# 각자 독립적으로 감시하고 있어서, 창을 열면 한 번에 다 닫힌다.
`$timer = New-Object System.Windows.Forms.Timer
`$timer.Interval = 400
`$timer.Add_Tick({
    `$fg = [ClaudeNotifyFocus]::GetForegroundWindow()
    `$procId = 0
    [ClaudeNotifyFocus]::GetWindowThreadProcessId(`$fg, [ref]`$procId) | Out-Null
    try {
        `$name = (Get-Process -Id `$procId -ErrorAction Stop).ProcessName
        if (`$name -eq 'Code') { `$form.Close() }
    } catch {}
})
`$form.Add_Shown({ `$timer.Start(); [System.Media.SystemSounds]::Asterisk.Play() })
`$form.Add_FormClosed({ `$timer.Stop(); `$timer.Dispose() })
[void]`$form.ShowDialog()
`$form.Dispose()
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded

exit 0
