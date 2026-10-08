$ErrorActionPreference='Stop'
$commit='d108dee53ff3bfb2be8bb0110166ac6f06b09048'
$folder='../retained-438-01a11c7b/managed-438/r1-f417e84b'
$entries=Get-Content -Raw "$folder/artifact-digests.json" | ConvertFrom-Json
$result=@()
foreach($entry in $entries){
 $url="https://raw.githubusercontent.com/MChartier/calibrate-health/$commit/managed-438/r1-f417e84b/$($entry.path)"
 $response=Invoke-WebRequest -Uri $url
 $bytes=$response.RawContentStream.ToArray()
 $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLower()
 if($digest -ne $entry.sha256){throw "Hash mismatch: $($entry.path)"}
 $result+=@{path=$entry.path;url=$url;sha256=$digest;status=$response.StatusCode}
}
$result | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 ../evidence-438-01a11c7b/r1-public-access.json
"Verified $($result.Count) public artifacts"
