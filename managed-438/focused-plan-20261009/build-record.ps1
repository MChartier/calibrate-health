$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$live = Get-Content -LiteralPath "$dir/live-readback.json" -Raw | ConvertFrom-Json
$old = Get-Content -LiteralPath "$dir/../retained-438-01a11c7b/managed-438/simplification-assessment/scope-audit.json" -Raw | ConvertFrom-Json
if ($live.files.Count -ne 38 -or $live.commits.Count -ne 4) { throw 'Inventory changed' }
$files = foreach ($f in $live.files) {
  $prior = $old.files | Where-Object path -EQ $f.filename
  if (!$prior -or $prior.additions -ne $f.additions -or $prior.deletions -ne $f.deletions) { throw "Unreconciled path: $($f.filename)" }
  $action = 'retain focused removal/configuration change'
  if ($f.status -eq 'removed') { $action = 'retain deletion of removed feature and its obsolete tests' }
  if ($f.filename -match 'AuthContext|offlineWorkspace') { $action = 'split: retain picker API deletion/startup gate; conditionally isolate or minimize session safety with regressions retained' }
  if ($f.filename -match '/storage\.') { $action = 'retain atomic startup binding; separately disposition in-flight write cancellation without losing R1 protection' }
  if ($f.filename -match 'targetTransition\.') { $action = 'consolidate into existing storage boundary; retain all transition behavior regressions' }
  if ($f.filename -match 'targetTransitionState|offline/database') { $action = 'retain bounded read-only state/schema safety and tests; reuse actual namespace validators' }
  if ($f.filename -match 'README') { $action = 'retain only maintained endpoint/recovery guidance; coordinate release-owner hunk overlap' }
  [ordered]@{path=$f.filename;status=$f.status;previousPath=$f.previous_filename;additions=$f.additions;deletions=$f.deletions;kind=$prior.kind;disposition=$action;rationale=$prior.assessment}
}
$commitNotes = @(
'Mixed direct removal, startup protection and generic epochs: selectively reimplement focused outcome; preserve original commit, no wholesale cherry-pick.',
'Mixed browser scheduling, valid empty-install/Health Connect handling and config test: retain startup correctness; browser race scope conditional; preserve original.',
'Test timeout only: do not import automatically; future test timeout must be justified by the maintained environment.',
'Known R1 protection: preserve regression and evidence; minimal solution or admitted safety prerequisite required before dropping broad implementation.'
)
$commits = for ($i=0; $i -lt $live.commits.Count; $i++) {
  $c=$live.commits[$i]
  if ($c.sha -ne $old.commits[$i].sha) { throw 'Commit order changed' }
  [ordered]@{sha=$c.sha;parents=@($c.parents | ForEach-Object sha);message=$c.commit.message;disposition=$commitNotes[$i]}
}
$out = [ordered]@{checkedAtUtc=$live.checkedAtUtc;head=$live.pr.head.sha;apiBase=$live.pr.base.sha;mergeBase='4cbcbc740fbe5fa5646b4de31951c79a653176d5';actualMaster='547206a1b372b73fc95fc412ad453b8099440000';bodySha256='2f99aa6cd7078a5e5afa690df2aaf0f90ed90661f821629ddfc76da5bd602a04';totals=$old.totals;commits=$commits;files=$files;scope='planning only; dispositions not implemented'}
$out | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath "$dir/dispositions.json" -Encoding utf8
$records = @(
@{commit='a7d2ad1648d2b743cdfda5ef66950f6feee741ad';path='managed-438/';purpose='original 4cb baseline/8a6 source captures and fixture/harness/build provenance';sha256='08e3f6ec0867f9b28cc3141b1a8995c36eb4dddb7cd1631cad651bbe9c7c8dbd'},
@{commit='0ad646c474e5b95a4d6230419cb73528d0debcae';path='managed-438/review-final/';purpose='8e source captures/provenance';sha256='85d2a43d5136b0a12fbd9fefb6545d7b6430eebde582f0c2d0abe4ae817f3825'},
@{commit='296ef4f724d2c0e8c808ea6192a06a10c7a24b73';purpose='60ec checkpoint'},
@{commit='2a0ae75409c702662cada6b4c63396f363cc8d1d';purpose='initial handoff'},
@{commit='d1032e7d703b0a152ab1d84168f54c0d0f5fdb2f';purpose='terminal metadata original'},
@{commit='abe48a92efdf313af8f8c9bc720abe900fa561e1';purpose='terminal metadata original'},
@{commit='d108dee53ff3bfb2be8bb0110166ac6f06b09048';path='managed-438/r1-f417e84b/';purpose='f417 genuine captures, R1 logs and provenance';sha256='9a02eeb7f19b56020094bbf7c46ac7ac3f02f46bd7873ce52f125750c6b22e31'},
@{commit='27f6a292704d42499d8169866729d1d1c5a8ae40';path='managed-438/r1-handoff/';purpose='historical final body/scope/feedback/CI bindings';sha256='fad5bfb24ee4be51e401f5f04089f29ffe84a577abf4f222df538d2c309e0382'},
@{commit='7067b73a5122d7ef8bcfdc8bcb4c0d4b56ceba5d';path='managed-438/simplification-assessment/';purpose='local unpublished earlier-master audit; preserve bytes';proposalSha256='8d6076feed6e5b9815ff60800b74a561e7b2004c32c2bc3a48a3cf887efe4a3f';auditSha256='7a38d025b8fb0bb007cd2e7edee7179cb0f1fc90a1009edbd1c0ab14f89c6239';published=$false},
@{commit='8457ed1a3bbb0f0381b48e22a40aac52b223ae6c';path='pr439-evidence/provenance.json';purpose='PR439 original evidence; admin/bootstrap scope remains deferred'},
@{commit='6b265afbb92951ba55e1c22212374225049c580e';path='pr402-recovery/retention-manifest.json';purpose='PR402 retained originals'},
@{commit='e1d6bad89ab4c4079156ab27ae99af20092bc17a';path='verdict.json';purpose='historical QA comment6067421414'},
@{commit='83bdc1a9a09e1e03dab0489651cde268264010b9';path='final-verdict.json';purpose='historical QA comment6067468474'},
@{commit='1c92e91e8e19de8c9cd24eac0b38f050402076b4';path='verdict.json';purpose='historical positive QA comment6068415457; invalidated by scope feedback'}
)
[ordered]@{owner='01a11c7b-b7fa-7578-9694-80a1cae2b03d';repository='MChartier/calibrate-health';productRef='refs/heads/mchartier/managed-438-01a11c7b';productHead=$live.pr.head.sha;evidenceRef='refs/heads/evidence/managed-438-01a11c7b';lastVerifiedRemoteEvidenceHead='27f6a292704d42499d8169866729d1d1c5a8ae40';localUnpublishedEvidenceHead='7067b73a5122d7ef8bcfdc8bcb4c0d4b56ceba5d';retention='Preserve indefinitely for this review/history unless human explicitly authorizes disposal; no refs deleted or rewritten';access='Historical accessible evidence is recorded, not freshly byte-reverified by this planning turn. Local audit and current plan are unpublished. Future publication/access verification is required before successor evidence reliance.';records=$records} | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath "$dir/retention.json" -Encoding utf8
$inventory = Get-ChildItem -LiteralPath $dir -File | Where-Object Name -NE 'manifest.json' | Sort-Object Name | ForEach-Object { [ordered]@{path=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} }
[ordered]@{createdAtUtc=[DateTime]::UtcNow.ToString('o');scope='local planning deliverables only';files=@($inventory)} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$dir/manifest.json" -Encoding utf8
Get-FileHash -LiteralPath "$dir/plan.md","$dir/dispositions.json","$dir/retention.json","$dir/manifest.json" -Algorithm SHA256 | Select-Object Path,Hash | ConvertTo-Json
