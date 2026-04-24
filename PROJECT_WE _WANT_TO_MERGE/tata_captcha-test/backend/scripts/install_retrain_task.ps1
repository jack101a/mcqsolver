param(
    [string]$PythonExe = "python",
    [string]$WorkingDir = (Resolve-Path "..").Path,
    [string]$TaskName = "AI-Retrain-Worker"
)

$scriptPath = Join-Path $WorkingDir "scripts\\retrain_worker.py"
$action = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$scriptPath`"" -WorkingDirectory $WorkingDir
$trigger = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "AI retrain worker loop" -Force
Write-Host "Scheduled task '$TaskName' installed."
