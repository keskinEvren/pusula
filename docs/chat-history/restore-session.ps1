# Restore script for Antigravity Session 3ceb9622-b493-4d7b-907e-ced36f58edb2 on Windows
# Run this on Windows where you want to restore the exact chat session.

param (
    [string]$SessionId = "3ceb9622-b493-4d7b-907e-ced36f58edb2"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tarFile = Join-Path $scriptDir "session-$SessionId.tar.gz"

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
Write-Host "Paket Dosyası: $tarFile"

tar -xzf $tarFile -C $destDir

# macOS metadata dosyalarını temizle
Get-ChildItem -Path (Join-Path $destDir "conversations"), (Join-Path $destDir "brain\$SessionId") -Filter "._*" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "Başarıyla tamamlandı!" -ForegroundColor Green
Write-Host "Oturum ID: $SessionId"
Write-Host "Antigravity IDE veya agy CLI açıldığında bu oturum otomatik olarak geçmişte görünecektir."
