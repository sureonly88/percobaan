@echo off
REM Generate self-signed TLS certificate untuk Pedami Print Bridge
REM Jalankan sekali sebagai Administrator, lalu restart server.js

setlocal
set DIR=%~dp0

echo Membuat konfigurasi OpenSSL...
(
echo [req]
echo default_bits       = 2048
echo prompt             = no
echo default_md         = sha256
echo distinguished_name = dn
echo x509_extensions    = v3_req
echo.
echo [dn]
echo CN = localhost
echo.
echo [v3_req]
echo subjectAltName = @alt_names
echo.
echo [alt_names]
echo DNS.1 = localhost
echo IP.1  = 127.0.0.1
) > "%DIR%cert.conf"

echo Mencari openssl...

REM Coba lokasi umum openssl di Windows
set OPENSSL=
if exist "C:\Program Files\Git\usr\bin\openssl.exe"     set OPENSSL=C:\Program Files\Git\usr\bin\openssl.exe
if exist "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" set OPENSSL=C:\Program Files\OpenSSL-Win64\bin\openssl.exe
if exist "C:\Windows\System32\openssl.exe"               set OPENSSL=C:\Windows\System32\openssl.exe

REM Coba dari PATH
if "%OPENSSL%"=="" (
  where openssl >nul 2>&1
  if not errorlevel 1 set OPENSSL=openssl
)

if "%OPENSSL%"=="" (
  echo.
  echo [ERROR] openssl tidak ditemukan.
  echo         Install Git for Windows ^(sudah termasuk openssl^):
  echo         https://git-scm.com/download/win
  echo.
  del "%DIR%cert.conf" 2>nul
  pause
  exit /b 1
)

echo Menggunakan: %OPENSSL%
echo Membuat certificate...

"%OPENSSL%" req -x509 -newkey rsa:2048 ^
  -keyout "%DIR%key.pem" ^
  -out    "%DIR%cert.pem" ^
  -days   3650 ^
  -nodes  ^
  -config "%DIR%cert.conf"

if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Gagal membuat certificate.
  del "%DIR%cert.conf" 2>nul
  pause
  exit /b 1
)

del "%DIR%cert.conf" 2>nul

echo.
echo ======================================================
echo   Sertifikat berhasil dibuat!
echo ======================================================
echo   cert.pem + key.pem tersimpan di: %DIR%
echo.
echo   Langkah selanjutnya:
echo   1. Restart: node server.js
echo   2. Buka browser -^> https://localhost:6789
echo   3. Klik "Advanced" -^> "Proceed to localhost"
echo      untuk trust certificate (cukup sekali)
echo   4. Di Pengaturan app, set URL Bridge ke:
echo      https://localhost:6789
echo ======================================================
pause
