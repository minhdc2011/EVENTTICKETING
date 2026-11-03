# Team hierarchy on agentkit (agents are defined in .agentkit.yaml):
#
#   director (Codex GPT-6 Astra)   1. writes the plan for the manager           -> agentkit run @director
#   manager  (Claude Opus 5.5)     2. splits the plan into tasks, assigns them   -> agentkit fix --from plan
#   workers  (sonnet, gemini)      3. write the code in a worktree, one commit per approved task
#   manager                        4. reviews each worker diff                   -> (solve.reviewer)
#   evidence                       5. gate log + before/after screenshots and layout audit, on the branch worktree
#   manager                        6. writes the report to the director          -> agentkit --repo <worktree> run @manager
#   director                       7. reviews report + diff + screenshots IN THE WORKTREE -> APPROVED / REVISE
#
# Usage (from the repo root; commit unfinished work first, fix starts from HEAD):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .multiagent\org.ps1 -Task "request"
#   powershell -NoProfile -ExecutionPolicy Bypass -File .multiagent\org.ps1 -TaskFile request.md -Yes
#   -PlanOnly  : stop after the manager's task list, nothing is edited
#   -Yes       : run every task the manager plans, without asking
#   -NoScreens : skip the screenshot step (non-UI work)
# With $env:AGENTKIT_MOCK=1 the agentkit steps are mocked and the director review is skipped (no quota used).
param(
    [string]$Task,
    [string]$TaskFile,
    [switch]$Yes,
    [switch]$PlanOnly,
    [switch]$NoScreens,
    [string]$DirectorModel = "gpt-6-astra",
    [int]$BeforePort = 3201,
    [int]$AfterPort = 3202
)
# "Continue": in Windows PowerShell 5.1, "Stop" turns any stderr line of a native tool (npm, codex, vite) into a fatal
# error. Failures are caught explicitly instead: Check() after every native call, throw on missing results.
$ErrorActionPreference = "Continue"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo
if ($TaskFile) { $Task = Get-Content -Raw -Encoding UTF8 $TaskFile }
if (-not $Task) { throw "Provide -Task or -TaskFile" }
$Task = $Task.Replace('"', "'")   # Windows PowerShell 5.1 mangles embedded double quotes in native args

$run = ".multiagent/runs/" + (Get-Date -Format "yyyyMMdd-HHmmss")
$runAbs = Join-Path $repo $run
New-Item -ItemType Directory -Force $runAbs | Out-Null
[IO.File]::WriteAllText((Join-Path $runAbs "task.md"), $Task, $utf8)

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE). Outputs: $run" } }

# 1) Director plans for the manager
Step "1/7 Director (GPT-6 Astra) writes the plan"
agentkit run --no-live --name org-plan --out "$run/1-director-plan.md" `
    "@director Write the PLAN you hand to your manager for this request. Request: $Task"
Check "director plan"

# 2-4) Manager splits and assigns; workers do the work; manager reviews each diff
Step "2/7 Manager (Opus 5.5) assigns tasks to the workers (sonnet, gemini) and reviews their diffs"
$before = @(git branch --list "agentkit/*" --format "%(refname:short)")
$fixArgs = @("fix", "--from", "$run/1-director-plan.md")
if ($Yes) { $fixArgs += "--yes" }
if ($PlanOnly) { $fixArgs += "--plan-only" }
$fixArgs += "Carry out the director's plan in this file. Split it into tasks and assign each one to sonnet or gemini."
agentkit @fixArgs
# exit 3 = some tasks were not approved; the approved ones are still committed, so report on them
if ($LASTEXITCODE -ne 3) { Check "agentkit fix" }
if ($PlanOnly) { Step "Plan only: done. Director plan: $run/1-director-plan.md"; exit 0 }

$branch = @(git branch --list "agentkit/*" --format "%(refname:short)") | Where-Object { $before -notcontains $_ } | Select-Object -Last 1
if (-not $branch) { throw "agentkit fix did not create a branch (nothing confirmed, or stopped). Outputs: $run" }

# The branch lives in its own worktree: every later step reads THAT version, not the main checkout
$wt = $null; $cur = $null
foreach ($line in (git worktree list --porcelain)) {
    if ($line -like "worktree *") { $cur = $line.Substring(9) }
    elseif ($line -eq "branch refs/heads/$branch") { $wt = $cur }
}
if (-not $wt) { throw "No worktree found for $branch" }
$wt = (Resolve-Path $wt).Path
git diff "HEAD...$branch" | Out-File -Encoding utf8 "$run/2-diff.patch"
git log --oneline "HEAD..$branch" | Out-File -Encoding utf8 "$run/2-commits.txt"
$planJson = Get-ChildItem "$env:USERPROFILE\.agentkit\plans" -Filter "*.json" | Sort-Object LastWriteTime | Select-Object -Last 1

# 5) Evidence: gate on the integrated branch, then before/after screenshots
Step "5/7 Evidence: gate on $branch, before/after screenshots"
Push-Location $wt
npm run check *> "$runAbs/3-gate.log"
$gateExit = $LASTEXITCODE
Pop-Location
$gateTail = (Get-Content "$runAbs/3-gate.log" -Encoding UTF8 | Select-String "^> |tests \d|pass \d|fail \d|error|built in" |
    ForEach-Object { $_.Line.Trim() }) -join "`n"
Write-Host "gate exit $gateExit"

$images = @()
$auditText = "(screenshots skipped)"
if (-not $NoScreens) {
    if (-not (Test-Path "$PSScriptRoot\node_modules\playwright-core")) {
        Push-Location $PSScriptRoot
        npm install --no-audit --no-fund | Out-Null
        $npmExit = $LASTEXITCODE
        Pop-Location
        if ($npmExit -ne 0) { throw "npm install in .multiagent failed (exit $npmExit)" }
    }
    if ((Test-Path "$repo\.env.local") -and -not (Test-Path "$wt\.env.local")) { Copy-Item "$repo\.env.local" "$wt\.env.local" }
    $env:VITE_USE_MOCK_DATA = "true"   # never touch the real database while capturing
    $servers = @(
        Start-Process node -ArgumentList "node_modules/vite/bin/vite.js", "--port", $BeforePort, "--strictPort" -WorkingDirectory $repo -PassThru -WindowStyle Hidden
        Start-Process node -ArgumentList "node_modules/vite/bin/vite.js", "--port", $AfterPort, "--strictPort" -WorkingDirectory $wt -PassThru -WindowStyle Hidden
    )
    try {
        foreach ($port in $BeforePort, $AfterPort) {
            $ok = $false
            for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
                try { $ok = (Invoke-WebRequest "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { Start-Sleep -Seconds 1 }
            }
            if (-not $ok) { throw "dev server on port $port did not start" }
        }
        node "$PSScriptRoot\screenshots.mjs" "$runAbs\shots" "http://localhost:$BeforePort" "http://localhost:$AfterPort"
        Check "screenshots"
    } finally {
        foreach ($s in $servers) { taskkill /T /F /PID $s.Id 2>&1 | Out-Null }
        Remove-Item Env:VITE_USE_MOCK_DATA -ErrorAction SilentlyContinue
    }
    $auditText = Get-Content -Raw -Encoding UTF8 "$runAbs\shots\audit-compare.txt"
    $images = @(Get-ChildItem "$runAbs\shots\after\*-360.png", "$runAbs\shots\after\*-1440.png", "$runAbs\shots\before\*-360.png" |
        ForEach-Object FullName)
}

# 6) Manager reports to the director, reading the branch worktree
Step "6/7 Manager writes the report for the director"
agentkit --repo $wt run --no-live --name org-report --out "$runAbs/4-manager-report.md" (
    "@manager Write your REPORT TO THE DIRECTOR on the work your team just finished on branch $branch (this checkout). " +
    "Read: the director's plan $runAbs/1-director-plan.md; your task plan $($planJson.FullName); " +
    "the approved commits $runAbs/2-commits.txt (tasks with no commit were rejected or not run); the full diff $runAbs/2-diff.patch; " +
    "the gate log $runAbs/3-gate.log (exit $gateExit); the before/after layout audit $runAbs/shots/audit-compare.txt. " +
    "Include: summary, task table (task / worker / result / your review), files changed, how each acceptance criterion is met " +
    "and with what evidence (code reading, gate, screenshot audit), what is NOT verified, open issues.")
Check "manager report"

# 7) Director reviews the report in the branch worktree, with the screenshots attached
Step "7/7 Director reviews the manager's report (in the branch worktree, with screenshots)"
$reviewFile = "$runAbs/5-director-review.md"
$reviewPrompt = @"
You are the DIRECTOR (GPT-6 Astra). Your only direct report is the MANAGER (Claude Opus 5.5), who leads two workers
(Claude Sonnet 5.5, Gemini 3.8 Flash). You never write code; you review read-only. Write in the language of the request.

The current directory is the worktree of branch ${branch}: it already CONTAINS the delivered change. Base: the main
checkout's HEAD. The change set is: git diff HEAD...$branch run in $repo, also saved as $runAbs/2-diff.patch.

Read: your plan $runAbs/1-director-plan.md ; the manager's report $runAbs/4-manager-report.md .
Gate (npm run check on this worktree): exit $gateExit
$gateTail

Before/after layout audit (headless Chromium, mock data):
$auditText

Attached images: after/*-360.png, after/*-1440.png (AFTER) and before/*-360.png (BEFORE), full pages.

Review against your acceptance criteria and constraints. Separate (a) blocking defects in the delivered change from
(b) evidence gaps that are follow-up work. Give numbered feedback. The LAST line must be exactly one of:
VERDICT: APPROVED
VERDICT: REVISE
"@
if ($env:AGENTKIT_MOCK) {
    [IO.File]::WriteAllText($reviewFile, "[mock] director review skipped ($($images.Count) images ready)`nVERDICT: REVISE", $utf8)
} else {
    $imgArgs = @(); foreach ($i in $images) { $imgArgs += "-i"; $imgArgs += $i }
    $reviewPrompt | & codex exec -m $DirectorModel -c 'model_reasoning_effort="high"' -s read-only -C $wt @imgArgs `
        -o $reviewFile - *> "$runAbs/5-director-review.log"
    Check "director review (codex)"
}
Write-Host (Get-Content -Raw -Encoding UTF8 $reviewFile)

$review = Get-Content -Raw -Encoding UTF8 $reviewFile
$id = $branch -replace "^agentkit/", ""
if ($review -match "VERDICT:\s*APPROVED") {
    Step "APPROVED by the director. Branch: $branch"
    Write-Host "  git diff HEAD...$branch`n  git merge --no-ff $branch`n  agentkit drop $id"
} else {
    Step "REVISE requested by the director. Branch: $branch (not merged)"
    Write-Host "Feedback: $run/5-director-review.md"
    Write-Host "To revise on top of this branch (keeps the approved commits):"
    Write-Host "  agentkit --repo `"$wt`" fix --from `"$runAbs/5-director-review.md`" `"Fix the director's feedback`""
}
