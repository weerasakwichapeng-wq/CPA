# Convert IFL_2025.gpkg -> data/ifl-thailand.js (Thailand-only polygons)
# Uses sqlite3.exe + custom WKB parser

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$sqlite = Join-Path $env:TEMP "sqlite3.exe"
if (-not (Test-Path $sqlite)) {
  Write-Host "sqlite3.exe not found at $sqlite"
  exit 1
}

$ifl = Join-Path $env:USERPROFILE "Downloads\IFL_2025.gpkg"
if (-not (Test-Path $ifl)) {
  Write-Host "IFL gpkg not found at $ifl"
  exit 1
}

Write-Host "sqlite3: $sqlite"
Write-Host "ifl gpkg: $ifl"
Write-Host "Extracting hex(geom) for Thailand bbox..."

# Single-line SQL to avoid PowerShell parsing issues
$sql = "SELECT IFL_ID || '|' || Area2025 || '|' || hex(geom) AS row FROM IFL_2025 WHERE fid IN (SELECT id FROM rtree_IFL_2025_geom WHERE minx >= 97 AND maxx <= 106 AND miny >= 5 AND maxy <= 21);"

$rows = & $sqlite $ifl $sql
Write-Host "Extracted $($rows.Count) rows"

# Helpers for binary reading
function Read-U32LE { param([byte[]]$b, [ref]$o)
  $v = [BitConverter]::ToUInt32($b, $o.Value)
  $o.Value += 4
  return $v
}
function Read-DoubleLE { param([byte[]]$b, [ref]$o)
  $v = [BitConverter]::ToDouble($b, $o.Value)
  $o.Value += 8
  return $v
}

function Parse-GpkgGeometry { param([byte[]]$bytes)
  if ($bytes[0] -ne 0x47 -or $bytes[1] -ne 0x50) { throw "Not a GPKG geometry" }
  $flags = $bytes[3]
  $envType = ($flags -shr 1) -band 0x07
  $envBytes = switch ($envType) { 0 { 0 } 1 { 32 } 2 { 48 } 3 { 48 } 4 { 64 } default { 0 } }
  $offset = 8 + $envBytes
  $byteOrder = $bytes[$offset]; $offset++
  $oRef = [ref]$offset
  $geomType = Read-U32LE $bytes $oRef
  $polygons = New-Object System.Collections.ArrayList
  if ($geomType -eq 3) {
    $numRings = Read-U32LE $bytes $oRef
    $rings = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $numRings; $i++) {
      $numPoints = Read-U32LE $bytes $oRef
      $ring = New-Object System.Collections.ArrayList
      for ($j = 0; $j -lt $numPoints; $j++) {
        $x = Read-DoubleLE $bytes $oRef
        $y = Read-DoubleLE $bytes $oRef
        [void]$ring.Add(@($x, $y))
      }
      [void]$rings.Add($ring)
    }
    [void]$polygons.Add($rings)
  } elseif ($geomType -eq 6) {
    $numPolys = Read-U32LE $bytes $oRef
    for ($p = 0; $p -lt $numPolys; $p++) {
      $oRef.Value += 1
      [void](Read-U32LE $bytes $oRef)  # polyType
      $numRings = Read-U32LE $bytes $oRef
      $rings = New-Object System.Collections.ArrayList
      for ($i = 0; $i -lt $numRings; $i++) {
        $numPoints = Read-U32LE $bytes $oRef
        $ring = New-Object System.Collections.ArrayList
        for ($j = 0; $j -lt $numPoints; $j++) {
          $x = Read-DoubleLE $bytes $oRef
          $y = Read-DoubleLE $bytes $oRef
          [void]$ring.Add(@($x, $y))
        }
        [void]$rings.Add($ring)
      }
      [void]$polygons.Add($rings)
    }
  }
  # Wrap to prevent PowerShell auto-enumeration
  return ,$polygons
}

function HexToBytes { param([string]$hex)
  $len = [int]($hex.Length / 2)
  $bytes = New-Object byte[] $len
  for ($i = 0; $i -lt $len; $i++) {
    $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
  }
  return ,$bytes
}

Write-Host "Parsing WKB..."
$out = New-Object System.Collections.ArrayList
foreach ($row in $rows) {
  $parts = $row -split '\|', 3
  if ($parts.Count -lt 3) { continue }
  $id = $parts[0]
  $area = [double]$parts[1]
  $hex = $parts[2]
  try {
    $bytes = HexToBytes $hex
    $polys = Parse-GpkgGeometry $bytes
    foreach ($poly in $polys) {
      if ($poly.Count -eq 0) { continue }
      $outer = $poly[0]
      if ($outer.Count -lt 3) { continue }
      $coordParts = @()
      foreach ($pt in $outer) {
        $coordParts += '[' + ($pt[0].ToString([System.Globalization.CultureInfo]::InvariantCulture)) + ',' + ($pt[1].ToString([System.Globalization.CultureInfo]::InvariantCulture)) + ']'
      }
      $coordsJson = '[' + ($coordParts -join ',') + ']'
      [void]$out.Add(@{ id = $id; area = $area; coords = $coordsJson })
    }
  } catch {
    Write-Host "Failed to parse $id : $_"
  }
}
Write-Host "Parsed $($out.Count) polygons"

# Build JS file
$lines = @()
foreach ($f in $out) {
  $lines += '{"id":"' + $f.id + '","area":' + $f.area + ',"coords":' + $f.coords + '}'
}
$content = 'window.IFL_THAILAND = [' + ($lines -join ',') + '];'

$outFile = Join-Path $ScriptDir "data\ifl-thailand.js"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outFile, $content, $utf8)
Write-Host ("Wrote " + $outFile + " (" + (Get-Item $outFile).Length + " bytes)")
