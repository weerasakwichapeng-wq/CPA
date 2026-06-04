# Rotate all PNG pages 90° counter-clockwise for easier reading
Add-Type -AssemblyName System.Drawing

$src = "C:\Users\ASUS\AppData\Local\Temp\pdfpages"
$dst = "C:\Users\ASUS\AppData\Local\Temp\pdfpages_rot"
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

$files = Get-ChildItem -Path $src -Filter "*.png"
Write-Host "Rotating $($files.Count) files..."
foreach ($f in $files) {
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
    $out = Join-Path $dst $f.Name
    $img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
  } catch { Write-Host "Failed $($f.Name): $_" }
}
Write-Host "Done. Output: $dst"
