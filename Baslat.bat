@echo off
title Akilli WC Operasyon ve Kalite Takip Sistemi
chcp 65001 >nul
echo ============================================================
echo   Akilli WC Operasyon ve Kalite Takip Sistemi Baslatiliyor
echo ============================================================
echo.
echo [1/2] Web Portali Tarayicida Aciliyor (http://localhost:5173)...
start http://localhost:5173
echo [2/2] Gelistirici Sunuculari (API & Web) Baslatiliyor...
echo.
npm run dev
pause
