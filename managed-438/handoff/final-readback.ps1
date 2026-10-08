$ErrorActionPreference='Stop'
$root='https://api.github.com/repos/MChartier/calibrate-health'
$records=[ordered]@{checkedAtUtc=[DateTime]::UtcNow.ToString('o')}
foreach($entry in @(@('pr','pulls/450'),@('commits','pulls/450/commits?per_page=100'),@('files','pulls/450/files?per_page=100'),@('issue','issues/438'),@('issueComments','issues/438/comments?per_page=100'),@('comments','issues/450/comments?per_page=100'),@('reviews','pulls/450/reviews?per_page=100'),@('inlineComments','pulls/450/comments?per_page=100'))){
 $res=Invoke-WebRequest -Uri "$root/$($entry[1])"
 if($res.Headers.Link -match 'rel="next"'){throw "Pagination required: $($entry[0])"}
 $records[$entry[0]]=ConvertFrom-Json -InputObject $res.Content
}
$records | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 ../evidence-438-01a11c7b/final-published-readback.json
$bodyHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($records.pr.body))).ToLower()
@{head=$records.pr.head.sha;base=$records.pr.base.sha;draft=$records.pr.draft;bodySha256=$bodyHash;commits=@($records.commits).Count;files=@($records.files).Count;additions=$records.pr.additions;deletions=$records.pr.deletions;issueComments=@($records.issueComments).Count;inlineComments=@($records.inlineComments).Count} | ConvertTo-Json
