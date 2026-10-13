param(
    [ValidateSet('open', 'auto', 'islogin', 'close')]
    [string]$Action = 'open',
    [int]$AutoPort = 9420,
    [string]$ToolsPath = 'E:\微信web开发者工具'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'project-shell.ps1')
$wechatDataPath = Join-Path $env:LOCALAPPDATA '微信开发者工具\User Data'
$wechatData = Get-Item -LiteralPath $wechatDataPath
if (-not ($wechatData.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw '微信工具仍会把数据写入默认用户目录；请先完成 E 盘数据目录迁移。'
}
$wechatActualData = [System.IO.Path]::GetFullPath([string]@($wechatData.Target)[0])
if (-not $wechatActualData.StartsWith('E:\Project\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw '微信工具的数据目录未指向 E:\Project，停止启动。'
}
$wechatCli = Join-Path $ToolsPath 'cli.bat'
if ($Action -eq 'islogin') {
    $wechatOutput = & $wechatCli islogin
} elseif ($Action -eq 'auto') {
    $wechatOutput = & $wechatCli auto --project $kejianRoot --auto-port $AutoPort
} else {
    $wechatOutput = & $wechatCli $Action --project $kejianRoot
}
Write-Output $wechatOutput
if ($LASTEXITCODE -ne 0) { throw "微信工具命令失败，退出码 $LASTEXITCODE" }
if (($wechatOutput -join "`n") -match '(?m)^\[error\]') { throw '微信工具返回错误，详见上方信息。' }
