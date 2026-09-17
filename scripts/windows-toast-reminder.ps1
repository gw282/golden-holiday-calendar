<#
.SYNOPSIS
  윈도우 우측 하단에 토스트 알림을 띄운다. 특정 일정의 1시간/30분/15분 전에
  맞춰 Windows 작업 스케줄러로 이 스크립트를 실행하면 그 시점 문구가 뜬다.

.PARAMETER MinutesBefore
  15, 30, 60 중 하나. 몇 분 전 알림인지.

.PARAMETER Title
  알림 제목 — 보통 일정 이름을 넣는다.

.EXAMPLE
  powershell -File windows-toast-reminder.ps1 -MinutesBefore 15 -Title "주간 회의"

.EXAMPLE  (작업 스케줄러에 등록할 때)
  schtasks /create /tn "주간회의-15분전" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\...\windows-toast-reminder.ps1 -MinutesBefore 15 -Title '주간 회의'" /sc once /st 09:45
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(15, 30, 60)]
    [int]$MinutesBefore,

    [string]$Title = "일정 알림"
)

$label = switch ($MinutesBefore) {
    60 { "1시간 전입니다" }
    30 { "30분 전입니다" }
    15 { "15분 전입니다" }
}

# WinRT 토스트 API를 직접 부른다 — 외부 모듈(BurntToast 등) 설치 없이 Windows 10/11
# 기본 PowerShell 5.1에서 그대로 동작한다.
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

# AppId를 임의 문자열로 두면 "Windows PowerShell"이라는 이름으로만 뜨고 알림이
# 안 보이는 경우가 있다. 이 AUMID는 Windows PowerShell 자신이 이미 등록해 둔
# 것이라 별도 앱 등록 없이도 안정적으로 뜬다.
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function New-ToastXmlText([string]$value) {
    # 제목·본문에 XML 특수문자(<, &, ")가 들어와도 깨지지 않게 이스케이프한다
    [System.Security.SecurityElement]::Escape($value)
}

$toastXml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$(New-ToastXmlText $Title)</text>
      <text>$(New-ToastXmlText $label)</text>
    </binding>
  </visual>
</toast>
"@

$xmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
$xmlDoc.LoadXml($toastXml)
$toast = New-Object Windows.UI.Notifications.ToastNotification $xmlDoc
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
