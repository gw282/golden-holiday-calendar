# Claude Code 「Stop」 훅 — 답변이 끝나면 팝업으로 알린다.
#
# 팝업을 **떼어 낸 프로세스**에서 띄우는 이유: 훅은 명령이 끝날 때까지 Claude Code를
# 붙잡아 둔다. 이 스크립트 안에서 MessageBox를 그대로 띄우면 사람이 [확인]을 누를
# 때까지 다음 입력이 막히고, 타임아웃까지 걸리면 훅이 실패로 기록된다.
# 그래서 여기서는 창을 띄우라고 시키기만 하고 즉시 빠져나온다.

$ErrorActionPreference = 'SilentlyContinue'

# 훅 페이로드(JSON)가 stdin으로 들어온다. 쓰지 않더라도 읽어서 파이프를 비워 준다.
$null = [Console]::In.ReadToEnd()

$where = Split-Path -Leaf (Get-Location)
$when  = Get-Date -Format 'HH:mm:ss'
$body  = "답변이 끝났습니다.`n`n$where  ·  $when"

# 따옴표가 섞여도 깨지지 않도록 -EncodedCommand로 넘긴다.
# (중첩 -Command 문자열은 인용 부호를 세 번 벗겨야 해서 한글·줄바꿈에서 잘 깨진다)
$inner = @"
Add-Type -AssemblyName System.Windows.Forms
# 소유자 폼을 TopMost로 두지 않으면 다른 창 뒤에 떠서 못 보고 지나친다
`$owner = New-Object System.Windows.Forms.Form
`$owner.TopMost = `$true
[System.Media.SystemSounds]::Asterisk.Play()
[System.Windows.Forms.MessageBox]::Show(`$owner, @'
$body
'@, 'Claude Code', 'OK', 'Information') | Out-Null
`$owner.Dispose()
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded

exit 0
