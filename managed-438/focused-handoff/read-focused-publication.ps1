$ErrorActionPreference='Stop'
$folder=Join-Path $PSScriptRoot 'focused-evidence-438/publication'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$prefix='https://api.github.com/repos/MChartier/calibrate-health/'
$all=@{}
foreach($pair in @(@('pr','pulls/459'),@('commits','pulls/459/commits?per_page=100'),@('files','pulls/459/files?per_page=100'),@('comments','issues/459/comments?per_page=100'),@('reviews','pulls/459/reviews?per_page=100'),@('inline','pulls/459/comments?per_page=100'),@('issue','issues/438'),@('master','git/ref/heads/master'),@('checks','commits/18cf84a2a4d5acc05ca14ecd2ddd861a1fe20b43/check-runs?per_page=100'))) {
 $url=$prefix+$pair[1]+$(if($pair[1].Contains('?')){'&'}else{'?'})+'readback='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 $response=Invoke-WebRequest -Uri $url -Headers @{Accept='application/vnd.github+json';'Cache-Control'='no-cache'}
 if(($response.Headers.Link -join ',') -match 'rel="next"') { throw ('Unprocessed pagination: '+$pair[0]) }
 [IO.File]::WriteAllText((Join-Path $folder ($pair[0]+'.json')),$response.Content)
 $all[$pair[0]]=$response.Content | ConvertFrom-Json
}
$sha={param($s) [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($s))).ToLower()}
$summary=@{checkedAt=[DateTime]::UtcNow.ToString('o');head=$all.pr.head.sha;base=$all.pr.base.sha;actualMaster=$all.master.object.sha;bodySha256=(& $sha $all.pr.body);issueBodySha256=(& $sha $all.issue.body);draft=$all.pr.draft;commits=@($all.commits).Count;files=@($all.files).Count;expectedCommits=$all.pr.commits;expectedFiles=$all.pr.changed_files;checks=@($all.checks.check_runs | Select-Object name,status,conclusion,head_sha,html_url);reviewCount=@($all.reviews).Count;inlineCount=@($all.inline).Count;commentCount=@($all.comments).Count}
if($summary.commits -ne $summary.expectedCommits -or $summary.files -ne $summary.expectedFiles) { throw 'Published scope totals mismatch' }
[IO.File]::WriteAllText((Join-Path $folder 'summary.json'),($summary | ConvertTo-Json -Depth 10))
$summary | ConvertTo-Json -Depth 8
