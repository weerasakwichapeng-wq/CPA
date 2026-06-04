# ============================================================
#  push-to-github.ps1
#  Push เว็บ FSC ตรวจสอบย้อนกลับ ขึ้น GitHub Pages
#  รันครั้งเดียว – ใช้เวลาประมาณ 1-2 นาที
# ============================================================

$TOKEN    = "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"
$USERNAME = "weerasakwichapeng-wq"
$REPO     = "CPA"
$BRANCH   = "main"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  FSC Dashboard → GitHub Pages" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

# ── ตรวจสอบ git ─────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[!] ยังไม่มี git – กำลังติดตั้ง..." -ForegroundColor Yellow
    winget install --id Git.Git -e --source winget
    $env:Path += ";C:\Program Files\Git\cmd"
}
Write-Host "[✓] git พร้อมใช้งาน" -ForegroundColor Green

# ── สร้าง repo บน GitHub ────────────────────────────────────
Write-Host "[→] กำลังสร้าง repo '$REPO'..."
$headers = @{
    Authorization = "token $TOKEN"
    "Content-Type" = "application/json"
    "User-Agent"   = "PowerShell"
}
$body = @{
    name        = $REPO
    description = "ระบบตรวจสอบย้อนกลับ FSC ยางพารา – เถ้าแก่น้อย"
    private     = $false
    auto_init   = $false
} | ConvertTo-Json

try {
    $resp = Invoke-RestMethod -Uri "https://api.github.com/user/repos" `
        -Method POST -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "[✓] สร้าง repo สำเร็จ: $($resp.html_url)" -ForegroundColor Green
} catch {
    $errMsg = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errMsg.errors.message -like "*already exists*") {
        Write-Host "[i] Repo มีอยู่แล้ว – ดำเนินการต่อ" -ForegroundColor Cyan
    } else {
        Write-Host "[!] เกิดข้อผิดพลาด: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# ── เข้าโฟลเดอร์เว็บไซต์ ────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
Write-Host "[→] โฟลเดอร์ปัจจุบัน: $scriptDir"

# ── init git ────────────────────────────────────────────────
if (-not (Test-Path ".git")) {
    git init -b $BRANCH
    Write-Host "[✓] git init เสร็จแล้ว" -ForegroundColor Green
} else {
    Write-Host "[i] git repo มีอยู่แล้ว" -ForegroundColor Cyan
}

# ── ตั้งค่า user ────────────────────────────────────────────
git config user.email "weerasak.wichapeng@gmail.com"
git config user.name  "weerasak-wichapeng"

# ── เพิ่ม remote ────────────────────────────────────────────
$remoteUrl = "https://$TOKEN@github.com/$USERNAME/$REPO.git"
git remote remove origin 2>$null
git remote add origin $remoteUrl
Write-Host "[✓] ตั้ง remote origin เสร็จแล้ว" -ForegroundColor Green

# ── .gitignore ──────────────────────────────────────────────
@"
*.ps1
*.bat
*.kml
fmu-owners.txt
"@ | Out-File -Encoding UTF8 ".gitignore"

# ── commit & push ───────────────────────────────────────────
Write-Host "[→] กำลัง commit และ push..."
git add .
git commit -m "Initial commit: FSC Rubber Traceability Dashboard"
git push -u origin $BRANCH --force

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  [✓] Push สำเร็จ!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# ── เปิด GitHub Pages ───────────────────────────────────────
Write-Host "[→] กำลังเปิด GitHub Pages..."
$pagesBody = @{
    source = @{ branch = $BRANCH; path = "/" }
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$USERNAME/$REPO/pages" `
        -Method POST -Headers $headers -Body $pagesBody -ErrorAction Stop | Out-Null
    Write-Host "[✓] GitHub Pages เปิดแล้ว!" -ForegroundColor Green
} catch {
    # อาจเปิดอยู่แล้ว
    Write-Host "[i] Pages อาจเปิดอยู่แล้วหรือกำลังประมวลผล" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  URL เว็บไซต์ของคุณ:" -ForegroundColor Yellow
Write-Host "  https://$USERNAME.github.io/$REPO/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (URL จะพร้อมใช้งานภายใน 1-3 นาที)" -ForegroundColor Gray
Write-Host ""

# เปิด browser ไปที่ repo
Start-Process "https://github.com/$USERNAME/$REPO"
