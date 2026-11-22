[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$LocalRoot,
    [string]$KachuRoot,
    [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'ShivamBoardGameSync'),
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$BaseCommit = '9b4ada9488f9d8801952a1eb94b1c3cd66f27e15',
    [switch]$PrepareOnly,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'Shivam Board and Card Games Sync'

if ($Uninstall) {
    if ($PSCmdlet.ShouldProcess($taskName, 'Remove the automatic sync schedule')) {
        $existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
        if ($existing) {
            Unregister-ScheduledTask -InputObject $existing -Confirm:$false
        }
    }
    return
}

function Get-SourceRoot([string]$Path, [string]$Label) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw "Supply -$Label with the game checkout path." }
    $item = Get-Item -LiteralPath $Path
    if (-not $item.PSIsContainer) { throw "$Label must be a folder." }
    return $item.FullName
}

function Write-InstalledFile([string]$Path, [byte[]]$Bytes) {
    # The scheduled worker may be running during a later installer update.
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllBytes($temporary, $Bytes)
        if ([IO.File]::Exists($Path)) {
            [IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value)
        } else {
            [IO.File]::Move($temporary, $Path)
        }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

$localPath = Get-SourceRoot $LocalRoot 'LocalRoot'
$kachuPath = Get-SourceRoot $KachuRoot 'KachuRoot'
$runtime = [IO.Path]::GetFullPath($StateDir)
$bin = Join-Path $runtime 'bin'
$entry = Join-Path $bin 'sync.mjs'
$launcher = Join-Path $bin 'hidden-run.vbs'
$settingsFile = Join-Path $runtime 'config.json'
$node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$git = (Get-Command git.exe -CommandType Application | Select-Object -First 1).Source
$gh = (Get-Command gh.exe -CommandType Application | Select-Object -First 1).Source
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$settings = [ordered]@{
    stateDir = $runtime
    localRoot = $localPath
    kachuRoot = $kachuPath
    collectionUrl = 'https://github.com/Shivamshaiv/board-and-card-games.git'
    kachuUrl = 'https://github.com/Shivamshaiv/Card_Games_RL-Kachuful.git'
    baseCommit = $BaseCommit
    verifyPrivate = $true
    gitPath = $git
    ghPath = $gh
}

if (-not $PSCmdlet.ShouldProcess($runtime, 'Install the game sync worker and local path configuration')) { return }
[IO.Directory]::CreateDirectory($bin) | Out-Null
foreach ($name in @('sync.mjs', 'policy.mjs')) {
    $bytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))
    Write-InstalledFile (Join-Path $bin $name) $bytes
}
$utf8 = [Text.UTF8Encoding]::new($false)
Write-InstalledFile $settingsFile ($utf8.GetBytes(($settings | ConvertTo-Json) + [Environment]::NewLine))

# WScript keeps the recurring console executable invisible. Waiting propagates the
# worker's exit code to Task Scheduler and gives IgnoreNew a real process lifetime.
$hiddenRunner = @'
Option Explicit
Dim args, shell, command, i
Set args = WScript.Arguments
Set shell = CreateObject("WScript.Shell")
command = ""
For i = 0 To args.Count - 1
    command = command & " " & Chr(34) & args(i) & Chr(34)
Next
WScript.Quit shell.Run(Trim(command), 0, True)
'@
Write-InstalledFile $launcher ($utf8.GetBytes($hiddenRunner + [Environment]::NewLine))
if ($PrepareOnly) {
    Write-Output "Worker configuration: $settingsFile"
    return
}

if (-not $PSCmdlet.ShouldProcess($taskName, 'Register and start the five-minute per-user sync task')) { return }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$actionArgs = '//B //NoLogo "{0}" "{1}" "{2}" "{3}"' -f $launcher, $node, $entry, $settingsFile
$action = New-ScheduledTaskAction -Execute $wscript -Argument $actionArgs -WorkingDirectory $runtime
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$interval = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$options = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger @($logon, $interval) -Principal $principal -Settings $options -Description 'Sync local board and card game sources to their folders in the private GitHub collection.' -Force | Out-Null
Start-ScheduledTask -TaskPath '\' -TaskName $taskName
Write-Output "Installed task: $taskName"
Write-Output "Worker configuration: $settingsFile"
