@echo off
title Pedami Print Bridge — Setup
echo ==================================================
echo   Pedami Print Bridge — Setup Wizard
echo ==================================================
echo.

:: Cek Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terinstall.
  echo         Download: https://nodejs.org  ^(pilih LTS^)
  echo         Setelah install, jalankan script ini lagi.
  pause
  exit /b 1
)
echo [OK] Node.js ditemukan.
echo.

:: Buat shortcut auto-start di Startup folder
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0

echo @echo off                                  > "%STARTUP%\PedamiPrintBridge.bat"
echo title Pedami Print Bridge                 >> "%STARTUP%\PedamiPrintBridge.bat"
echo cd /d "%SCRIPT_DIR%"                      >> "%STARTUP%\PedamiPrintBridge.bat"
echo node server.js                            >> "%STARTUP%\PedamiPrintBridge.bat"

echo [OK] Shortcut auto-start dibuat: %STARTUP%\PedamiPrintBridge.bat
echo.

:: Tampilkan config saat ini
echo --- Konfigurasi saat ini (config.json) ---
type "%SCRIPT_DIR%\config.json"
echo.
echo ------------------------------------------
echo.
echo LANGKAH SELANJUTNYA:
echo 1. Edit config.json — sesuaikan "printerName" dengan nama printer di Windows
echo    ^(Buka: Settings ^> Bluetooth ^& devices ^> Printers ^& scanners^)
echo.
echo 2. Untuk mode 'ps' ^(default, direkomendasikan^):
echo    Pastikan nama printer di config.json PERSIS sama dengan yang di Windows.
echo.
echo 3. Untuk mode 'copy' ^(alternatif^):
echo    a. Share printer: klik kanan printer ^> Properties ^> Sharing ^> Share this printer
echo       Beri nama share: EPSONLX
echo    b. Jalankan sebagai Administrator:
echo       net use LPT3: \\localhost\EPSONLX /persistent:yes
echo    c. Edit config.json: "printMode": "copy", "portMapping": "LPT3:"
echo.
echo 4. Jalankan bridge sekarang: node server.js
echo    Atau restart PC — bridge akan otomatis jalan.
echo.
echo 5. Cek status di browser: http://localhost:6789
echo ==================================================
pause
