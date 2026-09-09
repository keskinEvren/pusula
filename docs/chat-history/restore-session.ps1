# Restore script for Antigravity Session 4f656576-acae-42f2-8392-9de76f24d183 on Windows
# Run this on Windows where you want to restore the exact chat session.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tarFile = Join-Path $scriptDir "session-4f656576-acae-42f2-8392-9de76f24d183.tar.gz"

if (-not (Test-Path $tarFile)) {
    Write-Error "Hata: Paket dosyası bulunamadı: $tarFile"
    exit 1
}

$userProfile = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)
$destDir = Join-Path $userProfile ".gemini\antigravity"

New-Item -ItemType Directory -Force -Path (Join-Path $destDir "conversations") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $destDir "brain") | Out-Null

Write-Host "=== Antigravity Chat Oturumu Geri Yükleniyor ===" -ForegroundColor Cyan
Write-Host "Hedef Dizin: $destDir"

tar -xzf $tarFile -C $destDir

# macOS metadata dosyalarını temizle
Get-ChildItem -Path (Join-Path $destDir "conversations"), (Join-Path $destDir "brain\4f656576-acae-42f2-8392-9de76f24d183") -Filter "._*" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "Başarıyla tamamlandı!" -ForegroundColor Green
Write-Host "Oturum ID: 4f656576-acae-42f2-8392-9de76f24d183"
Write-Host "Antigravity IDE veya agy CLI açıldığında bu oturum otomatik olarak geçmişte görünecektir."
