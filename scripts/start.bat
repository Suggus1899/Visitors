@echo off
setlocal enabledelayedexpansion
title LogMaster - Inicio Rapido
color 0A

echo.
echo  =============================================
echo   LOGMASTER - Sistema de Control de Acceso
echo  =============================================
echo.

:: ---------------------------------------------------
:: 1. Verificar Docker Desktop
:: ---------------------------------------------------
echo  [1/5] Verificando Docker Desktop...
docker version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] Docker Desktop no esta corriendo.
    echo  Inicia Docker Desktop y vuelve a ejecutar este script.
    echo.
    pause
    exit /b 1
)
echo       [OK] Docker Desktop activo

:: ---------------------------------------------------
:: 2. Configurar entorno
:: ---------------------------------------------------
echo.
echo  [2/5] Configurando entorno...

:: Detectar directorio raiz
set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd
cd /d "%PROJECT_ROOT%"

:: Crear .env si no existe y actualizar ALLOWED_ORIGINS siempre (IP cambia con DHCP)
call "scripts\auto-env.bat" >nul 2>&1

:: Detectar IP
set "LOCAL_IP=localhost"
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|Docker' -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1 -ExpandProperty IPAddress" 2^>nul') do (
    set "LOCAL_IP=%%i"
)

echo       [OK] IP detectada: %LOCAL_IP%

:: ---------------------------------------------------
:: 3. Verificar/crear directorios de datos
:: ---------------------------------------------------
echo.
echo  [3/5] Verificando directorios de datos...
if not exist "data\postgres" mkdir "data\postgres"
if not exist "data\photos" mkdir "data\photos"
if not exist "logs\server" mkdir "logs\server"
if not exist "logs\client" mkdir "logs\client"
echo       [OK] Directorios listos

:: ---------------------------------------------------
:: 4. Iniciar servicios
:: ---------------------------------------------------
echo.
echo  [4/5] Iniciando servicios...

:: Verificar si es primera vez (no existe base de datos)
set "FIRST_RUN=0"
if not exist "data\postgres\PG_VERSION" set "FIRST_RUN=1"

if %FIRST_RUN% equ 1 (
    echo       Primera ejecucion detectada. Construyendo imagenes...
    echo       Esto puede tomar 3-5 minutos la primera vez.
    docker-compose up -d --build
) else (
    echo       Reutilizando imagenes existentes...
    docker-compose up -d
)

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] No se pudieron iniciar los servicios.
    echo  Ejecuta: docker-compose logs
    pause
    exit /b 1
)

echo       [OK] Servicios iniciados

:: ---------------------------------------------------
:: 5. Healthcheck y abrir navegador
:: ---------------------------------------------------
echo.
echo  [5/5] Esperando inicializacion...
echo       Esperando PostgreSQL (15s)...
timeout /t 15 /nobreak >nul

echo       Verificando API...
set "RETRIES=0"
:health_check_loop
curl -s -f http://localhost:3000/api/v1/health >nul 2>&1
if %ERRORLEVEL% equ 0 goto :health_ok
set /a RETRIES+=1
if %RETRIES% gtr 10 (
    echo       [WARN] API tarda en responder, pero continuando...
    goto :health_done
)
timeout /t 3 /nobreak >nul
goto :health_check_loop

:health_ok
echo       [OK] API respondiendo

:health_done
echo.
echo  =============================================
color 0A
echo   SISTEMA LISTO
echo  =============================================
echo.
echo   Acceso Local:
echo      http://localhost
echo      https://localhost
echo.
echo   Acceso desde Red LAN:
echo      http://%LOCAL_IP%
echo.
echo   Credenciales de prueba:
echo      Admin:  1234567890 / admin123
echo      Guard:  0987654321 / guard123
echo.
echo   Abriendo navegador...
start http://localhost
echo.
echo   Comandos utiles:
echo      scripts\status.bat    - Ver estado
echo      scripts\detener.bat   - Detener sistema
echo      scripts\verify-system.bat - Verificacion completa
echo.
pause
