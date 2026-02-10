$TASK_NAME = "SkipDaumGameStarterUAC"
$REG_PROTOCOL_KEY = "HKCU:\Software\Classes\daumgamestarter\shell\open\command"

# Detect AppData path for the launcher
$appDataPath = "$env:APPDATA\POE2-unofficial-launcher"
$workDir = "$appDataPath\uac_bypass"

Write-Host "--- Legacy UAC Bypass Restore Tool ---" -ForegroundColor Cyan
Write-Host "Target WorkDir: $workDir"

if (-not (Test-Path $appDataPath)) {
    Write-Host "Error: AppData folder not found at $appDataPath" -ForegroundColor Red
    Write-Host "Please ensure the launcher has been run at least once."
    exit
}

if (-not (Test-Path $workDir)) {
    New-Item -Path $workDir -ItemType Directory -Force | Out-Null
}

# 1. Get Current Command
$currentCmd = (Get-ItemProperty -Path $REG_PROTOCOL_KEY -Name "(default)" -ErrorAction SilentlyContinue)."(default)"

if (-not $currentCmd) {
    Write-Host "Error: Could not find DaumGameStarter registration in registry." -ForegroundColor Red
    exit
}

if ($currentCmd -like "*proxy.vbs*") {
    Write-Host "Legacy bypass is already active." -ForegroundColor Yellow
    exit
}

# 2. Extract EXE Path (Simple version)
if ($currentCmd -match '"([^"]+)"') {
    $originalExe = $Matches[1]
} else {
    $originalExe = $currentCmd.Split(" ")[0]
}

if (-not (Test-Path $originalExe)) {
    Write-Host "Error: Could not find original EXE at $originalExe" -ForegroundColor Red
    exit
}

Write-Host "Original EXE: $originalExe"

# 3. Backup Original Command
$currentCmd | Out-File -FilePath "$workDir\original_command.txt" -Encoding utf8

# 4. Create Scripts
$proxyVbs = @"
Set args = WScript.Arguments
strArgs = ""
For i = 0 To args.Count - 1
    strArgs = strArgs & " " & args(i)
Next
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objFile = objFSO.CreateTextFile("$workDir\launch_args.txt", True)
objFile.Write Trim(strArgs)
objFile.Close
CreateObject("WScript.Shell").Run "schtasks /run /tn \`"$TASK_NAME\`"", 0, False
"@

$runnerVbs = @"
Set objFSO = CreateObject("Scripting.FileSystemObject")
strArgs = ""
If objFSO.FileExists("$workDir\launch_args.txt") Then
    Set objFile = objFSO.OpenTextFile("$workDir\launch_args.txt", 1)
    strArgs = objFile.ReadAll
    objFile.Close
End If
CreateObject("WScript.Shell").Run """$originalExe"" " & strArgs, 1, False
"@

$proxyVbs | Out-File -FilePath "$workDir\proxy.vbs" -Encoding ASCII
$runnerVbs | Out-File -FilePath "$workDir\runner.vbs" -Encoding ASCII

# 5. Register Task (Requires Elevation for Highest Privilege)
Write-Host "Registering Scheduled Task (Highest Privilege)..." -ForegroundColor Cyan
$runnerPath = "$workDir\runner.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

try {
    Register-ScheduledTask -TaskName $TASK_NAME -Action $action -Trigger $trigger -Principal $principal -Force -ErrorAction Stop
} catch {
    Write-Host "Failed to register task. Please run this script as Administrator." -ForegroundColor Red
    exit
}

# 6. Update Registry
Write-Host "Updating Registry..." -ForegroundColor Cyan
$newCmd = "wscript.exe `"$workDir\proxy.vbs`" `"%1`""
Set-ItemProperty -Path $REG_PROTOCOL_KEY -Name "(default)" -Value $newCmd -Force

Write-Host "Successfully restored legacy UAC bypass!" -ForegroundColor Green
Write-Host "Scripts are located in: $workDir"
