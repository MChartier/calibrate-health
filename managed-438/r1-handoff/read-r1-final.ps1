$ErrorActionPreference='Stop'
$root='https://api.github.com/repos/MChartier/calibrate-health'
$records=[ordered]@{checkedAtUtc=[DateTime]::UtcNow.ToString('o')}
foreach($entry in @(@('pr','pulls/450'),@('target','git/ref/heads/master'),@('commits','pulls/450/commits?per_page=100'),@('files','pulls/450/files?per_page=100'),@('issue','issues/438'),@('issueComments','issues/438/comments?per_page=100'),@('comments','issues/450/comments?per_page=100'),@('reviews','pulls/450/reviews?per_page=100'),@('inlineComments','pulls/450/comments?per_page=100'),@('checks','commits/f417e84b430cc46275171462cc9d2373b8ee8f3e/check-runs?per_page=100'),@('predecessor','pulls/439'))){
 $join=if($entry[1].Contains('?')){'&'}else{'?'}
 $res=Invoke-WebRequest -Uri "$root/$($entry[1])${join}readback=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{'Cache-Control'='no-cache'}
 if($res.Headers.Link -match 'rel="next"'){throw "Pagination required: $($entry[0])"}
 $records[$entry[0]]=ConvertFrom-Json -InputObject $res.Content
}
$records | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 ../evidence-438-01a11c7b/r1-final-readback.json
$bodyHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($records.pr.body))).ToLower()
@{head=$records.pr.head.sha;base=$records.pr.base.sha;actualTarget=$records.target.object.sha;draft=$records.pr.draft;bodySha256=$bodyHash;commits=@($records.commits).Count;files=@($records.files).Count;additions=$records.pr.additions;deletions=$records.pr.deletions;checks=$records.checks.check_runs|Select-Object name,status,conclusion} | ConvertTo-Json -Depth 10
