# Extract polygons from both KML files into JS data files for the website.
# Productive area KML: green polygons → productive, blue polygons → water
# Land title KML: all polygons → landtitle

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false

# Derive base path from this script's location (avoids hard-coded Thai path strings
# which may get mangled by ANSI encoding when PowerShell reads the .ps1 file)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BasePath = Split-Path -Parent $ScriptDir
Write-Host "Script dir: $ScriptDir"
Write-Host "Base path:  $BasePath"

# Find KML files by pattern instead of by name (KML names contain Thai chars)
$prodKml = Get-ChildItem -Path $BasePath -Filter "Productive*.kml" | Select-Object -First 1
$ltKml   = Get-ChildItem -Path $BasePath -Filter "*.kml" | Where-Object { $_.Name -ne $prodKml.Name } | Select-Object -First 1
Write-Host "Productive KML: $($prodKml.FullName)"
Write-Host "Land title KML: $($ltKml.FullName)"

function Parse-KmlFile {
  param([string]$Path, [string]$DefaultType, [bool]$SplitByColor)

  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $placemarkRegex = [regex]'<Placemark[^>]*>([\s\S]*?)</Placemark>'
  $nameRegex     = [regex]'<name>([\s\S]*?)</name>'
  $descRegex     = [regex]'<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</description>'
  $styleRegex    = [regex]'<styleUrl>#?([\s\S]*?)</styleUrl>'
  $coordsRegex   = [regex]'<coordinates>([\s\S]*?)</coordinates>'

  $features = New-Object System.Collections.Generic.List[object]
  $matches = $placemarkRegex.Matches($text)
  foreach ($m in $matches) {
    $body = $m.Groups[1].Value
    $cM = $coordsRegex.Match($body)
    if (-not $cM.Success) { continue }

    $name = ""
    $nM = $nameRegex.Match($body); if ($nM.Success) { $name = $nM.Groups[1].Value.Trim() }
    $desc = ""
    $dM = $descRegex.Match($body); if ($dM.Success) { $desc = $dM.Groups[1].Value.Trim() }
    $styleUrl = ""
    $sM = $styleRegex.Match($body); if ($sM.Success) { $styleUrl = $sM.Groups[1].Value.Trim() }

    $type = $DefaultType
    if ($SplitByColor) {
      $hexM = [regex]::Match($styleUrl, 'poly-([0-9A-Fa-f]{6})')
      if ($hexM.Success) {
        $hex = $hexM.Groups[1].Value.ToUpper()
        if ($hex -eq "A1C2FA" -or $hex -eq "B2EBF2") { $type = "water" }
        else { $type = "productive" }
      }
    }

    $pairs = New-Object System.Collections.Generic.List[string]
    foreach ($tok in ($cM.Groups[1].Value.Trim() -split '\s+')) {
      if ($tok -eq '') { continue }
      $p = $tok -split ','
      if ($p.Count -ge 2) { $pairs.Add("[$($p[0]),$($p[1])]") }
    }
    if ($pairs.Count -lt 3) { continue }

    $features.Add([PSCustomObject]@{
      Name = $name
      Desc = $desc
      Type = $type
      StyleUrl = $styleUrl
      Coords = "[" + ($pairs -join ",") + "]"
    })
  }
  return ,$features
}

function ToJsString {
  param([string]$s)
  if ($null -eq $s) { return '""' }
  $r = $s
  $r = $r.Replace('\', '\\')
  $r = $r.Replace('"', '\"')
  $r = $r.Replace("`r", '')
  $r = $r.Replace("`n", '\n')
  $r = $r.Replace("`t", ' ')
  return '"' + $r + '"'
}

function Features-ToJson {
  param($feats)
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($f in $feats) {
    $obj = '{"name":' + (ToJsString $f.Name) + `
           ',"description":' + (ToJsString $f.Desc) + `
           ',"type":"' + $f.Type + '"' + `
           ',"styleUrl":' + (ToJsString $f.StyleUrl) + `
           ',"coordinates":' + $f.Coords + '}'
    $parts.Add($obj)
  }
  return "[" + ($parts -join ",") + "]"
}

Write-Host "==> Parsing productive KML ..."
$prodAll = Parse-KmlFile -Path $prodKml.FullName -DefaultType "productive" -SplitByColor $true
$prodOnly  = @($prodAll | Where-Object { $_.Type -eq "productive" })
$waterOnly = @($prodAll | Where-Object { $_.Type -eq "water" })
Write-Host "    Productive polygons: $($prodOnly.Count)"
Write-Host "    Water polygons:      $($waterOnly.Count)"

Write-Host "==> Parsing land title KML ..."
$ltAll = Parse-KmlFile -Path $ltKml.FullName -DefaultType "landtitle" -SplitByColor $false
Write-Host "    Land title polygons: $($ltAll.Count)"

$dataDir = "$BasePath\website\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$prodJson  = Features-ToJson $prodOnly
$waterJson = Features-ToJson $waterOnly
$ltJson    = Features-ToJson $ltAll

[System.IO.File]::WriteAllText("$dataDir\productive.js", "window.PRODUCTIVE_AREAS = $prodJson;", $utf8)
[System.IO.File]::WriteAllText("$dataDir\water.js",      "window.WATER_AREAS = $waterJson;", $utf8)
[System.IO.File]::WriteAllText("$dataDir\landtitles.js", "window.LAND_TITLES = $ltJson;", $utf8)

Write-Host ""
Write-Host "==> Done. Files written:"
Get-ChildItem $dataDir -Filter "*.js" | ForEach-Object {
  Write-Host ("    {0,-20} {1,8:N0} bytes" -f $_.Name, $_.Length)
}
