# Extract Member Data -> data/members.js
# -----------------------------------------------------------------
# Source: Google Sheets (public, no login)
# URL:    https://docs.google.com/spreadsheets/d/1CNqJ_okTGFvDI0NlzyqH3rpp3NV7o-Bz
# Re-run this script anytime to sync latest changes from the sheet.

$ErrorActionPreference = 'Stop'

# === Config ===
$SheetId   = '1CNqJ_okTGFvDI0NlzyqH3rpp3NV7o-Bz'
$ExportUrl = "https://docs.google.com/spreadsheets/d/$SheetId/export?format=xlsx"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BasePath  = Split-Path -Parent $ScriptDir
$xlsxPath  = Join-Path $BasePath 'P2_CP-Data_FSC_GoogleSheets.xlsx'

# === Step 1: Download latest copy from Google Sheets ===
Write-Host "Downloading from Google Sheets..."
Write-Host ("  URL: " + $ExportUrl)
try {
    Invoke-WebRequest -Uri $ExportUrl -OutFile $xlsxPath -UseBasicParsing
    $size = (Get-Item $xlsxPath).Length
    Write-Host ("  Downloaded: " + $xlsxPath + " (" + [Math]::Round($size/1024,1) + " KB)")
} catch {
    Write-Host "ERROR: Download failed - check (1) internet, (2) sheet is shared 'Anyone with link'"
    throw
}

# === Step 2: Open with Excel COM ===
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($xlsxPath)
    Write-Host ""
    Write-Host "Sheets in workbook:"
    $i = 1
    foreach ($s in $wb.Sheets) {
        Write-Host ("  [{0}] {1}" -f $i, $s.Name)
        $i++
    }

    # Use sheet 9 (same as original Excel layout). Override with $env:SHEET_INDEX if needed.
    $memberSheetIdx = if ($env:SHEET_INDEX) { [int]$env:SHEET_INDEX } else { 9 }
    if ($wb.Sheets.Count -lt $memberSheetIdx) {
        throw ("Workbook has only " + $wb.Sheets.Count + " sheets but requested index " + $memberSheetIdx)
    }
    $ws = $wb.Sheets.Item($memberSheetIdx)
    Write-Host ""
    Write-Host ("Using sheet [" + $memberSheetIdx + "]: " + $ws.Name)
    Write-Host ("Rows: " + $ws.UsedRange.Rows.Count + " | Cols: " + $ws.UsedRange.Columns.Count)

    # Field -> column-number mapping (from explore-excel.ps1)
    $fields = @{
        no = 1; rmu = 2; fmu = 3; plot = 4; memberId = 5
        gender = 7; idCard = 8; nameTh = 9; nameEn = 10
        phone = 11; age = 12; rubberRegNo = 13
        rmResponsible = 14; geResponsible = 15
        management = 16; docOwnerTh = 17; docOwnerEn = 18; relation = 19
        docType = 20; docNo = 21; taxStatus = 22; docIssueDate = 32
        beforeAfter37 = 33; plantYear = 34; cutAge = 35; reasonPass = 36
        rai = 37; ngan = 38; sqWah = 39; areaRai = 40; areaHa = 41
        plantBE = 42; rubberAge = 43; spacing = 44; species = 45
        moo = 46; village = 47; subdistrict = 48; district = 49; province = 50
        productiveArea = 51; fscArea = 52; nonFscArea = 53
        villageGroupHead = 55
        zipCode = 58
        productiveRai = 62; tappingArea = 63; tappingAge = 64
        woodArea = 67
        residenceArea = 68; riceArea = 69; waterArea = 70
        fruitArea = 71; otherArea = 72; conservationArea = 73; totalNonProductive = 74
        plotStatus = 75; nearbyArea = 76; bufferDistance = 77
        utmZone = 78; lat = 79; lng = 80
        contract = 83; revenueShare = 84; rubberType85 = 85; rubberType87 = 87
        tappingType = 88
        productForm = 90
        yieldLatexKgRai = 91
        yieldCupLumpKgYear = 92
        yieldPerRai = 93
        buyer = 94
        hub = 95
        deliveryPerRound = 96
        sacksReceived = 97
        cutBE25 = 104; cutBEActual = 105
        woodWeight = 106; woodVolume = 107; woodValue = 108
        ayi = 109; aac = 110
        chemicalType = 132; chemicalApplyDate = 133; chemicalRate = 134
        chemicalIngredient = 135; chemicalRegistered = 136
        chemicalApproval = 137; chemicalAmount = 138; chemicalCas = 139
    }

    function Get-Val { param($ws, $r, $c)
        $v = $ws.Cells.Item($r, $c).Value2
        if ($null -eq $v) { return $null }
        return $v
    }

    $members = New-Object System.Collections.Generic.List[object]
    # Fields ที่ใช้ merged cells ใน Excel (ครอบหลายแถว) - ต้อง fill-down เมื่อเจอ null
    # โดยเฉพาะ FMU, memberId, gender, idCard, nameTh, nameEn, phone, age, rubberRegNo,
    # rmResponsible, geResponsible, management (เป็นข้อมูลระดับเกษตรกรเดียวกัน หลายแปลง)
    $fillDownFields = @(
        'fmu','rmu','memberId','gender','idCard','nameTh','nameEn','phone','age',
        'rubberRegNo','rmResponsible','geResponsible','management',
        'docOwnerTh','docOwnerEn','relation','docType','docNo','taxStatus',
        'docIssueDate','beforeAfter37','plantYear','cutAge','reasonPass',
        'village','subdistrict','district','province','moo','zipCode',
        'contract','revenueShare','tappingType','buyer','hub'
    )
    # ค่าล่าสุดของ field ที่จะ fill-down
    $lastValues = @{}

    $r = 3
    while ($true) {
        $no = Get-Val $ws $r 1
        if (-not $no) { break }
        if ($r -gt 800) { break }

        $obj = [ordered]@{}
        foreach ($key in $fields.Keys) {
            $col = $fields[$key]
            $val = Get-Val $ws $r $col
            # Fill-down: ถ้า field เป็น null และเป็น fillDown field → ใช้ค่าล่าสุด
            if ($null -eq $val -and $fillDownFields -contains $key -and $lastValues.ContainsKey($key)) {
                $val = $lastValues[$key]
            } elseif ($null -ne $val -and $fillDownFields -contains $key) {
                # อัพเดทค่าล่าสุดเมื่อเจอค่าใหม่
                $lastValues[$key] = $val
            }
            $obj[$key] = $val
        }
        $members.Add([PSCustomObject]$obj)
        $r++
    }
    Write-Host ""
    Write-Host ("Extracted " + $members.Count + " members")
    # ตรวจสอบ fmu field — ต้องไม่มี null
    $emptyFmuCount = ($members | Where-Object { -not $_.fmu }).Count
    if ($emptyFmuCount -gt 0) {
        Write-Host ("WARNING: " + $emptyFmuCount + " members still have empty 'fmu' field after fill-down")
    } else {
        Write-Host "OK: all 'fmu' fields filled correctly"
    }

    function JsonStr { param([string]$s)
        if ($null -eq $s) { return '""' }
        $r = $s
        $r = $r -replace '\\', '\\'
        $r = $r -replace '"',  '\"'
        $r = $r -replace "`t", ' '
        $r = $r -replace "`r", ''
        $r = $r -replace "`n", '\n'
        $r = $r -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
        return '"' + $r + '"'
    }
    function JsonValue { param($v)
        if ($null -eq $v) { return 'null' }
        if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
        if ($v -is [double] -or $v -is [int] -or $v -is [decimal] -or $v -is [long]) {
            if ([double]::IsNaN([double]$v) -or [double]::IsInfinity([double]$v)) { return 'null' }
            return $v.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        }
        return JsonStr ([string]$v)
    }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("[")
    $first = $true
    foreach ($m in $members) {
        if (-not $first) { [void]$sb.Append(",") }
        $first = $false
        [void]$sb.Append("{")
        $kFirst = $true
        foreach ($p in $m.PSObject.Properties) {
            if (-not $kFirst) { [void]$sb.Append(",") }
            $kFirst = $false
            [void]$sb.Append('"' + $p.Name + '":' + (JsonValue $p.Value))
        }
        [void]$sb.Append("}")
    }
    [void]$sb.Append("]")

    $utf8 = New-Object System.Text.UTF8Encoding $false
    $out = Join-Path $ScriptDir "data\members.js"
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $stampIso = (Get-Date).ToString('o')   # ISO-8601 for JS parsing
    $header = "/* Auto-generated from Google Sheets " + $stamp + " - source: https://docs.google.com/spreadsheets/d/" + $SheetId + " */`n"
    # window.MEMBERS_LAST_SYNC = ISO timestamp (สำหรับเว็บคำนวณ "X ชม.ที่แล้ว")
    # window.MEMBERS_SOURCE_URL = Google Sheets URL (สำหรับลิงก์ไปเปิด sheet)
    $syncMeta = 'window.MEMBERS_LAST_SYNC = "' + $stampIso + '";' + "`n" +
                'window.MEMBERS_SOURCE_URL = "https://docs.google.com/spreadsheets/d/' + $SheetId + '/edit";' + "`n"
    [System.IO.File]::WriteAllText($out, $header + $syncMeta + "window.MEMBERS = " + $sb.ToString() + ";", $utf8)
    Write-Host ("Wrote: " + $out + " (" + [Math]::Round((Get-Item $out).Length/1024,1) + " KB)")

    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Host ""
Write-Host "Done. Re-run this script anytime to sync from Google Sheets."
