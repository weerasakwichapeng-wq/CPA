@echo off
chcp 65001 >nul
title FSC ตรวจสอบย้อนกลับ - Local Server

echo ====================================================
echo  FSC ตรวจสอบย้อนกลับ - เถ้าแก่น้อยยางพารา
echo  กำลังเริ่ม Local Web Server...
echo ====================================================
echo.
echo เปิดเว็บไซต์ที่: http://localhost:8765
echo กด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์
echo.

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:8765/'); $listener.Start(); Start-Process 'http://localhost:8765/'; Write-Host 'Server running...'; while ($listener.IsListening) { try { $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response; $path = $req.Url.LocalPath; if ($path -eq '/') { $path = '/index.html' }; $file = Join-Path (Get-Location) $path.TrimStart('/'); if (Test-Path $file -PathType Leaf) { $ext = [IO.Path]::GetExtension($file).ToLower(); $mime = switch ($ext) { '.html' {'text/html; charset=utf-8'} '.js' {'application/javascript; charset=utf-8'} '.css' {'text/css; charset=utf-8'} '.json' {'application/json; charset=utf-8'} '.kml' {'application/vnd.google-earth.kml+xml; charset=utf-8'} '.png' {'image/png'} '.jpg' {'image/jpeg'} '.pdf' {'application/pdf'} default {'application/octet-stream'} }; $bytes = [IO.File]::ReadAllBytes($file); $res.ContentType = $mime; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); Write-Host ('200 ' + $path) } else { $res.StatusCode = 404; Write-Host ('404 ' + $path) }; $res.Close() } catch { Write-Host ('ERROR: ' + $_) } }"

pause
