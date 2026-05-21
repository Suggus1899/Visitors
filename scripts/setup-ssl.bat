@echo off
setlocal enabledelayedexpansion

echo.
echo 🔒 Configuración SSL/TLS - LogMaster
echo =================================
echo.

set "DOMAIN=%~1"
if "%DOMAIN%"=="" set "DOMAIN=localhost"

set "EMAIL=%~2"
if "%EMAIL%"=="" set "EMAIL=admin@%DOMAIN%"

echo 📍 Dominio: %DOMAIN%
echo 📧 Email: %EMAIL%
echo.

echo Creando estructura de directorios SSL...
if not exist "ssl" mkdir ssl

echo [OK] Directorios creados

echo.
echo 🔧 Generando certificados de desarrollo para %DOMAIN%...

if "%DOMAIN%"=="localhost" (
    echo 📝 Generando certificados auto-firmados para desarrollo...
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 ^
        -keyout ssl\cert.pem ^
        -out ssl\cert.pem ^
        -subj "/C=US/ST=State/L=City/O=Organization/CN=%DOMAIN%" ^
        2>nul
    
    if !errorlevel! neq 0 (
        echo ❌ Error generando certificados auto-firmados
        echo    Asegúrate de tener OpenSSL instalado
        pause
        exit /b 1
    )
    
    copy ssl\cert.pem ssl\key.pem >nul
    echo ✅ Certificados auto-firmados generados
) else (
    echo Para produccion con Let's Encrypt, usa certbot manualmente:
    echo   certbot certonly --standalone -d %DOMAIN% --email %EMAIL%
    echo   copy /Y certs\fullchain.pem ssl\cert.pem
    echo   copy /Y certs\privkey.pem ssl\key.pem
    echo.
    pause
    exit /b 0
)

echo.
echo 🔧 Configurando permisos...
if exist "ssl\*.pem" (
    icacls ssl\*.pem /grant "Everyone:R" >nul 2>&1
    echo ✅ Permisos configurados
)

echo.
echo Reiniciando contenedor client para aplicar certificados...

docker-compose down client 2>nul
docker-compose up -d client

echo.
echo 📊 Verificando configuración SSL...

timeout /t 10 >nul

if "%DOMAIN%"=="localhost" (
    curl -k -s -o nul -w "%%{http_code}" https://localhost/health 2>nul
    if !errorlevel! equ 0 (
        echo ✅ SSL configurado correctamente
        echo 🌐 https://%DOMAIN% está disponible
    ) else (
        echo ⚠️  Verifica la configuración manualmente
    )
) else (
    curl -s -o nul -w "%%{http_code}" https://%DOMAIN%/health 2>nul
    if !errorlevel! equ 0 (
        echo ✅ SSL Let's Encrypt configurado correctamente
        echo 🌐 https://%DOMAIN% está disponible
    ) else (
        echo ⚠️  Verifica la configuración DNS y SSL
    )
)

echo.
echo 📋 Resumen de la configuración:
echo    📍 Dominio: %DOMAIN%
echo    🔒 Tipo SSL: %SSL_TYPE%
echo    🌐 URLs:
echo       • HTTP: http://%DOMAIN% (redirige a HTTPS)
echo       • HTTPS: https://%DOMAIN%
echo       • API: https://%DOMAIN%/api/
echo.
echo Para renovar certificados, reemplazar ssl/cert.pem y ssl/key.pem
echo y reiniciar: docker-compose restart client

echo.
echo ✅ Configuración SSL/TLS completada
echo.
pause
