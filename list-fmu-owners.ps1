# List unique FMU + owner names from members.js
$file = Join-Path $PSScriptRoot "data\members.js"
$txt = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$json = $txt -replace '^window\.MEMBERS\s*=\s*' -replace ';\s*$'
$data = $json | ConvertFrom-Json

$seen = @{}
$rows = @()
foreach ($m in $data) {
  $fmu = $m.fmu
  if (-not $fmu) { continue }
  $num = if ($fmu -match 'FMU\s*(\d+)') { [int]$matches[1] } else { continue }
  # Use docOwnerTh first (actual title owner), fallback to nameTh
  $owner = if ($m.docOwnerTh) { $m.docOwnerTh } else { $m.nameTh }
  if (-not $owner) { continue }
  $key = "$num"
  if (-not $seen.ContainsKey($key)) {
    $seen[$key] = $true
    $rows += [PSCustomObject]@{
      FmuNum = $num
      Fmu = $fmu
      DocOwner = $m.docOwnerTh
      MemberName = $m.nameTh
    }
  }
}
$rows | Sort-Object FmuNum | Format-Table -AutoSize FmuNum, Fmu, DocOwner, MemberName

# Also export as a simple list for matching
$out = Join-Path $PSScriptRoot "fmu-owners.txt"
$rows | Sort-Object FmuNum | ForEach-Object {
  "FMU$($_.FmuNum)`t$($_.DocOwner)`t($($_.MemberName))"
} | Out-File $out -Encoding utf8
Write-Host "`nWrote $out"
