# Team hierarchy on agentkit (agents are defined in .agentkit.yaml):
#
#   director (Codex GPT-6 Astra)   1. writes the plan for the manager          -> agentkit run @director
#   manager  (Claude Opus 5.5)     2. splits the plan into tasks, assigns them  -> agentkit fix --from plan
#   workers  (sonnet, gemini)      3. write the code/docs in a worktree         -> (fix coders)
#   manager                        4. reviews each worker diff                  -> (solve.reviewer)
#   manager                        5. writes the report to the director         -> agentkit run @manager
#   director                       6. reviews the report: APPROVED / REVISE     -> agentkit run @director
#
# Usage (from the repo root; commit unfinished work first, fix starts from HEAD):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .multiagent\org.ps1 -Task "request"
#   powershell -NoProfile -ExecutionPolicy Bypass -File .multiagent\org.ps1 -TaskFile request.md -Yes
#   -PlanOnly : stop after step 2 (director plan + manager task list), nothing is edited
#   -Yes      : run every task the manager plans, without asking
param(
    [string]$Task,
    [string]$TaskFile,
    [switch]$Yes,
    [switch]$PlanOnly
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo
if ($TaskFile) { $Task = Get-Content -Raw -Encoding UTF8 $TaskFile }
if (-not $Task) { throw "Provide -Task or -TaskFile" }
$Task = $Task.Replace('"', "'")   # Windows PowerShell 5.1 mangles embedded double quotes in native args

$run = ".multiagent/runs/" + (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Force $run | Out-Null
[IO.File]::WriteAllText((Join-Path $repo "$run/task.md"), $Task, $utf8)

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE). Outputs: $run" } }

# 1) Director plans for the manager
Step "1/6 Director (GPT-6 Astra) writes the plan"
agentkit run --no-live --name org-plan --out "$run/1-director-plan.md" `
    "@director Write the PLAN you hand to your manager for this request. Request: $Task"
Check "director plan"

# 2-4) Manager splits and assigns; workers do the work; manager reviews each diff
Step "2/6 Manager (Opus 5.5) assigns tasks to the workers (sonnet, gemini) and reviews their diffs"
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
git diff "HEAD...$branch" | Out-File -Encoding utf8 "$run/2-diff.patch"
git log --oneline "HEAD..$branch" | Out-File -Encoding utf8 "$run/2-commits.txt"
$planJson = Get-ChildItem "$env:USERPROFILE\.agentkit\plans" -Filter "*.json" | Sort-Object LastWriteTime | Select-Object -Last 1

# 5) Manager reports to the director
Step "5/6 Manager writes the report for the director"
agentkit run --no-live --name org-report --out "$run/3-manager-report.md" (
    "@manager Write your REPORT TO THE DIRECTOR on the work your team just finished on branch $branch. " +
    "Read: the director's plan $run/1-director-plan.md; your task plan $($planJson.FullName); " +
    "the approved commits $run/2-commits.txt (one commit per approved task; tasks with no commit were rejected or not run); " +
    "the full diff $run/2-diff.patch. Include: summary, task table (task / worker / result / your review), " +
    "files changed, how each acceptance criterion of the director is met, open issues.")
Check "manager report"

# 6) Director reviews the report
Step "6/6 Director reviews the manager's report"
agentkit run --no-live --name org-review --out "$run/4-director-review.md" (
    "@director Review the report your manager sent you: $run/3-manager-report.md. Your plan was $run/1-director-plan.md. " +
    "You may spot-check the diff $run/2-diff.patch. Check every acceptance criterion, give numbered feedback, " +
    "and end with exactly one line: VERDICT: APPROVED or VERDICT: REVISE.")
Check "director review"

$review = Get-Content -Raw -Encoding UTF8 "$run/4-director-review.md"
$id = $branch -replace "^agentkit/", ""
if ($review -match "VERDICT:\s*APPROVED") {
    Step "APPROVED by the director. Branch: $branch"
    Write-Host "  git diff HEAD...$branch`n  git merge $branch`n  agentkit drop $id"
} else {
    Step "REVISE requested by the director. Branch: $branch (not merged)"
    Write-Host "Feedback: $run/4-director-review.md"
    Write-Host "To revise: merge or discard the branch, then send the feedback down to the manager again:"
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .multiagent\org.ps1 -TaskFile $run/4-director-review.md"
}
