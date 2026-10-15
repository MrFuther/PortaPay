$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$credentialPath = Join-Path $workspacePath 'scratch\n8n\callback-credential.json'
$workflowPath = Join-Path $workspacePath 'n8n\Payment Method.secure.json'
if (-not (Test-Path -LiteralPath $credentialPath) -or -not (Test-Path -LiteralPath $workflowPath)) { throw 'Run configure-security.cjs and prepare-n8n.cjs first.' }
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5678 | Select-Object -ExpandProperty OwningProcess -Unique)
if ($listeners.Count -ne 1) { throw 'Expected exactly one n8n listener on 5678.' }
$n8nProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listeners[0])"
if ($n8nProcess.Name -ne 'node.exe' -or $n8nProcess.CommandLine -notmatch '[\\/]n8n[\\/]bin[\\/]n8n') { throw 'Port 5678 is not owned by the expected n8n Node process.' }
$n8nEntry = Join-Path $env:APPDATA 'npm\node_modules\n8n\bin\n8n'
if (-not (Test-Path -LiteralPath $n8nEntry)) { throw 'Installed n8n entry not found.' }
# Only restart the ordinary n8n invocation; custom flags need separate review.
if ($n8nProcess.CommandLine -notmatch '[\\/]n8n[\\/]bin[\\/]n8n"?\s*(?:start)?\s*$') { throw 'n8n uses custom command flags; inspect them before restart.' }
$nodeExecutable = $n8nProcess.ExecutablePath
$n8nCli = Join-Path $env:APPDATA 'npm\n8n.cmd'
& $n8nCli import:credentials "--input=$credentialPath"
if ($LASTEXITCODE -ne 0) { throw 'Credential import failed.' }
& $n8nCli import:workflow "--input=$workflowPath"
if ($LASTEXITCODE -ne 0) { throw 'Workflow import failed.' }
& $n8nCli publish:workflow '--id=K9ZIMlTQDCwVGVoy'
if ($LASTEXITCODE -ne 0) { throw 'Workflow publish failed.' }
# CLI publishing changes the stored version; restart loads that exact version.
Stop-Process -Id $n8nProcess.ProcessId
Wait-Process -Id $n8nProcess.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
$stdoutPath = Join-Path $workspacePath 'scratch\n8n\runtime.stdout.log'
$stderrPath = Join-Path $workspacePath 'scratch\n8n\runtime.stderr.log'
$newProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @("`"$n8nEntry`"", 'start') -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
Write-Output "Imported and published workflow K9ZIMlTQDCwVGVoy. n8n restarted as PID $($newProcess.Id)."
