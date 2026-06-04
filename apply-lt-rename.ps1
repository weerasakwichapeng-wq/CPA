# Apply land title file renames based on exported mapping JSON
# ─────────────────────────────────────────────────────────────
# 1. Use the "🔧 จับคู่เอกสารสิทธิ์" tool in the website to assign correct FMUs
# 2. Click "📤 ส่งออก mapping" — saves JSON file
# 3. Place the JSON file in this folder and run this script
# 4. Files will be renamed atomically (using temp suffixes to avoid collisions)
# ─────────────────────────────────────────────────────────────

param(
  [string]$MappingJson = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ltDir = Join-Path $ScriptDir "documents\landtitles"

if (-not $MappingJson) {
  $latest = Get-ChildItem -Path $ScriptDir -Filter "landtitle-mapping-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    Write-Host "❌ ไม่พบไฟล์ landtitle-mapping-*.json"
    Write-Host "   กรุณาส่งออก mapping จากเมนู '🔧 จับคู่เอกสารสิทธิ์' บนเว็บก่อน"
    exit 1
  }
  $MappingJson = $latest.FullName
}

Write-Host "📂 Mapping file: $MappingJson"
$mapping = Get-Content $MappingJson -Raw | ConvertFrom-Json
$pairs = @()
$mapping.PSObject.Properties | ForEach-Object {
  $fileNum = [int]$_.Name
  $actualFmu = [int]$_.Value
  if ($fileNum -ne $actualFmu) {
    $pairs += [PSCustomObject]@{ File = $fileNum; Actual = $actualFmu }
  }
}

if ($pairs.Count -eq 0) {
  Write-Host "✅ ไม่มีอะไรต้องเปลี่ยน — ทุกไฟล์ตรงกับ FMU แล้ว"
  exit 0
}

Write-Host ""
Write-Host "🔄 จะเปลี่ยนชื่อไฟล์ $($pairs.Count) ไฟล์:"
foreach ($p in $pairs) {
  $oldName = "FMU{0:D3}.pdf" -f $p.File
  $newName = "FMU{0:D3}.pdf" -f $p.Actual
  Write-Host "   $oldName → $newName"
}

# Phase 1: rename all to temp names (avoid collision)
Write-Host ""
Write-Host "Phase 1: rename → .tmp"
foreach ($p in $pairs) {
  $old = Join-Path $ltDir ("FMU{0:D3}.pdf" -f $p.File)
  $tmp = Join-Path $ltDir ("FMU{0:D3}.pdf.tmp" -f $p.Actual)
  if (Test-Path $old) {
    Move-Item -Path $old -Destination $tmp -Force
    Write-Host "   ✓ $($p.File) → tmp"
  }
}

# Phase 2: rename .tmp to final
Write-Host "Phase 2: .tmp → final name"
foreach ($p in $pairs) {
  $tmp = Join-Path $ltDir ("FMU{0:D3}.pdf.tmp" -f $p.Actual)
  $final = Join-Path $ltDir ("FMU{0:D3}.pdf" -f $p.Actual)
  if (Test-Path $tmp) {
    Move-Item -Path $tmp -Destination $final -Force
    Write-Host "   ✓ FMU$($p.Actual)"
  }
}

Write-Host ""
Write-Host "✅ เปลี่ยนชื่อเสร็จสิ้น $($pairs.Count) ไฟล์"
Write-Host "📌 ขั้นต่อไป: ในเว็บ ให้กด 'รีเซ็ตทั้งหมด' ในเมนู '🔧 จับคู่เอกสารสิทธิ์'"
Write-Host "   เพราะตอนนี้ชื่อไฟล์ตรงกับ FMU แล้ว ไม่ต้องใช้ mapping อีก"
