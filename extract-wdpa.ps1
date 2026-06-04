$ErrorActionPreference = 'Stop'
$wdpaDir = Join-Path $PSScriptRoot 'data\wdpa'
$outFile = Join-Path $PSScriptRoot 'data\wdpa.js'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-Shapefile {
    param([string]$ShpPath, [string]$DbfPath)

    $shpBytes = [System.IO.File]::ReadAllBytes($ShpPath)
    $dbfBytes = [System.IO.File]::ReadAllBytes($DbfPath)

    # Parse .dbf header
    $dbfRecordCount = [BitConverter]::ToInt32($dbfBytes, 4)
    $dbfHeaderSize  = [BitConverter]::ToInt16($dbfBytes, 8)
    $dbfRecordSize  = [BitConverter]::ToInt16($dbfBytes, 10)

    $fields = New-Object System.Collections.ArrayList
    $pos = 32
    while ($pos -lt $dbfHeaderSize -and $dbfBytes[$pos] -ne 0x0D) {
        $nameLen = 0
        while ($nameLen -lt 11 -and $dbfBytes[$pos + $nameLen] -ne 0) { $nameLen++ }
        $fieldName = [Text.Encoding]::ASCII.GetString($dbfBytes, $pos, $nameLen)
        $fieldLength = [int]$dbfBytes[$pos + 16]
        [void]$fields.Add([PSCustomObject]@{ Name = $fieldName; Length = $fieldLength })
        $pos += 32
    }

    # Find indices for NAME and DESIG
    $nameIdx = -1; $desigIdx = -1
    for ($i = 0; $i -lt $fields.Count; $i++) {
        if ($fields[$i].Name -eq 'NAME') { $nameIdx = $i }
        if ($fields[$i].Name -eq 'DESIG_ENG') { $desigIdx = $i }
    }

    # Build attribute rows (only NAME + DESIG to save memory)
    $attrs = New-Object System.Collections.ArrayList
    $recPos = $dbfHeaderSize
    for ($r = 0; $r -lt $dbfRecordCount; $r++) {
        $colPos = $recPos + 1
        $rowName = ''
        $rowDesig = ''
        for ($i = 0; $i -lt $fields.Count; $i++) {
            $flen = $fields[$i].Length
            if ($i -eq $nameIdx) {
                $rowName = [Text.Encoding]::UTF8.GetString($dbfBytes, $colPos, $flen).TrimEnd([char]0).Trim()
            }
            if ($i -eq $desigIdx) {
                $rowDesig = [Text.Encoding]::UTF8.GetString($dbfBytes, $colPos, $flen).TrimEnd([char]0).Trim()
            }
            $colPos += $flen
        }
        [void]$attrs.Add([PSCustomObject]@{ Name = $rowName; Desig = $rowDesig })
        $recPos += $dbfRecordSize
    }

    # Parse .shp records
    $features = New-Object System.Collections.ArrayList
    $offset = 100
    $shpLen = $shpBytes.Length
    $recIdx = 0

    while ($offset -lt $shpLen) {
        # Record header (big-endian)
        $contLenBE = ([int]$shpBytes[$offset+4] -shl 24) -bor ([int]$shpBytes[$offset+5] -shl 16) -bor ([int]$shpBytes[$offset+6] -shl 8) -bor [int]$shpBytes[$offset+7]
        $contentByteLen = $contLenBE * 2
        $contentStart = $offset + 8

        if (($contentStart + 4) -le $shpLen) {
            $shapeType = [BitConverter]::ToInt32($shpBytes, $contentStart)

            if ($shapeType -eq 5) {
                $numParts  = [BitConverter]::ToInt32($shpBytes, $contentStart + 36)
                $numPoints = [BitConverter]::ToInt32($shpBytes, $contentStart + 40)
                $partsStart = $contentStart + 44
                $pointsStart = $partsStart + ($numParts * 4)

                $partIndices = New-Object 'int[]' ($numParts + 1)
                for ($p = 0; $p -lt $numParts; $p++) {
                    $partIndices[$p] = [BitConverter]::ToInt32($shpBytes, $partsStart + $p * 4)
                }
                $partIndices[$numParts] = $numPoints

                $rings = New-Object System.Collections.ArrayList
                for ($p = 0; $p -lt $numParts; $p++) {
                    $startIdx = $partIndices[$p]
                    $endIdx   = $partIndices[$p + 1]
                    $ring = New-Object System.Collections.ArrayList
                    for ($i = $startIdx; $i -lt $endIdx; $i++) {
                        $x = [BitConverter]::ToDouble($shpBytes, $pointsStart + $i * 16)
                        $y = [BitConverter]::ToDouble($shpBytes, $pointsStart + $i * 16 + 8)
                        # Round to 6 decimal places (~10cm precision) to shrink file size
                        $xr = [Math]::Round($x, 6)
                        $yr = [Math]::Round($y, 6)
                        [void]$ring.Add(@($xr, $yr))
                    }
                    [void]$rings.Add($ring.ToArray())
                }

                $attr = $attrs[$recIdx]
                $featName = if ($attr.Name) { $attr.Name } else { 'Protected Area' }
                $featDesig = if ($attr.Desig) { $attr.Desig } else { '' }

                [void]$features.Add([PSCustomObject]@{
                    name  = $featName
                    desig = $featDesig
                    rings = $rings.ToArray()
                })
            }
        }

        $offset = $contentStart + $contentByteLen
        $recIdx++
    }

    return $features
}

# Main
$allFeatures = New-Object System.Collections.ArrayList
Get-ChildItem -Path $wdpaDir -Filter 'WDPA_*.zip' | Sort-Object Name | ForEach-Object {
    $zipPath = $_.FullName
    Write-Host ('Processing {0}...' -f $_.Name)

    $tmp = Join-Path $env:TEMP ('wdpa_extract_' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $tmp)

    $shp = Get-ChildItem -Path $tmp -Filter '*.shp' | Select-Object -First 1
    $dbf = Get-ChildItem -Path $tmp -Filter '*.dbf' | Select-Object -First 1

    if ($shp -and $dbf) {
        $feats = Read-Shapefile -ShpPath $shp.FullName -DbfPath $dbf.FullName
        Write-Host ('  -> {0} polygons' -f $feats.Count)
        foreach ($f in $feats) { [void]$allFeatures.Add($f) }
    } else {
        Write-Host '  WARNING: missing .shp or .dbf'
    }
    Remove-Item -Path $tmp -Recurse -Force
}

Write-Host ''
Write-Host ('Total features: {0}' -f $allFeatures.Count)

# Convert to JS using JSON serialization (handles escaping)
$json = $allFeatures | ConvertTo-Json -Depth 6 -Compress

$banner = @'
/* WDPA Protected Areas Thailand - pre-parsed from data/wdpa/*.zip
   Generated by extract-wdpa.ps1 -- format: [{name, desig, rings: [[[lng,lat],...], ...]}, ...] */
window.WDPA_AREAS =
'@

$out = $banner + "`n" + $json + ";`n"
[System.IO.File]::WriteAllText($outFile, $out, [Text.UTF8Encoding]::new($false))
$size = [Math]::Round((Get-Item $outFile).Length / 1024, 1)
Write-Host ''
Write-Host ('OK - wrote {0} ({1} KB)' -f $outFile, $size)
