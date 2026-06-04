$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BasePath = Split-Path -Parent $ScriptDir
$xlsxFile = Get-ChildItem -Path $BasePath -Filter "P2*.xlsx" | Where-Object { $_.Name -notlike "~*" } | Select-Object -First 1
Write-Host "Opening: $($xlsxFile.FullName)"
$wb = $excel.Workbooks.Open($xlsxFile.FullName)

# Member Data - dump header rows 1-3, all columns 50-164
$ws = $wb.Sheets.Item(9)  # Member Data is sheet 9
$cols = $ws.UsedRange.Columns.Count
Write-Host "Member Data: $($ws.UsedRange.Rows.Count) rows x $cols cols"
Write-Host ""
Write-Host "========== Header rows 1-3 for cols 50-$cols =========="
for ($c = 50; $c -le $cols; $c++) {
  $h1 = $ws.Cells.Item(1, $c).Value2
  $h2 = $ws.Cells.Item(2, $c).Value2
  $h3 = $ws.Cells.Item(3, $c).Value2
  $r3 = $ws.Cells.Item(3, $c).Value2  # first data row value as sample
  $r4 = $ws.Cells.Item(4, $c).Value2
  if ($h1 -or $h2 -or $h3 -or $r3 -or $r4) {
    $line = "Col ${c}: H1=[$h1] H2=[$h2] sample=[$r3 / $r4]"
    Write-Host $line
  }
}

# Production sheets - reference by index (5, 6, 7) to avoid Thai-string encoding issues
$prodIndices = @(5, 6, 7)
foreach ($idx in $prodIndices) {
  $s = $wb.Sheets.Item($idx)
  Write-Host ""
  Write-Host ("========== Sheet #{0}: {1} ==========" -f $idx, $s.Name)
  $rows = $s.UsedRange.Rows.Count
  $cols = $s.UsedRange.Columns.Count
  Write-Host "  Rows: $rows, Cols: $cols"
  # Print first 3 rows + first 25 cols
  for ($r = 1; $r -le [Math]::Min(4, $rows); $r++) {
    Write-Host "  --- Row $r ---"
    for ($c = 1; $c -le [Math]::Min(20, $cols); $c++) {
      $v = $s.Cells.Item($r, $c).Value2
      if ($v) { Write-Host "    [c$c] $v" }
    }
  }
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
