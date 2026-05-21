@echo off
setlocal enabledelayedexpansion
title LogMaster - Deploy Completo
color 0A

echo.
echo  =============================================
echo   LOGMASTER - Deploy Completo
echo  =============================================
echo.

:: ---------------------------------------------------
:: 1. Detectar directorio raiz del proyecto
:: ---------------------------------------------------
set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

set "SCRIPTS_DIR=%PROJECT_ROOT%\scripts"

:: ---------------------------------------------------
:: 2. Ejecutar auto-env.bat para configurar .env
:: ---------------------------------------------------
echo  [1/6] Configurando entorno...
call "%SCRIPTS_DIR%\auto-env.bat" <nul >nul 2>&1

:: Re-detectar IP (misma logica que auto-env)
set "LOCAL_IP="
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|Docker' -and ($_.PrefixOrigin -eq 'Dhcp' -or $_.PrefixOrigin -eq 'Manual') -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Sort-Object -Property InterfaceMetric | Select-Object -First 1).IPAddress"') do (
    set "LOCAL_IP=%%i"
)
if "%LOCAL_IP%"=="" set "LOCAL_IP=localhost"

echo  [OK] Entorno configurado - IP: %LOCAL_IP%
echo.

:: ---------------------------------------------------
:: 3. Verificar Docker Desktop
:: ---------------------------------------------------
echo  [2/6] Verificando Docker Desktop...
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
echo  [OK] Docker Desktop activo
echo.

:: ---------------------------------------------------
:: 4. Crear directorios para bind mounts
:: ---------------------------------------------------
echo  [3/6] Creando directorios de datos...
if not exist "%PROJECT_ROOT%\data\postgres" mkdir "%PROJECT_ROOT%\data\postgres"
if not exist "%PROJECT_ROOT%\data\photos" mkdir "%PROJECT_ROOT%\data\photos"
if not exist "%PROJECT_ROOT%\logs\server" mkdir "%PROJECT_ROOT%\logs\server"
if not exist "%PROJECT_ROOT%\logs\client" mkdir "%PROJECT_ROOT%\logs\client"
if not exist "%PROJECT_ROOT%\backups\postgres" mkdir "%PROJECT_ROOT%\backups\postgres"
echo  [OK] Directorios listos
echo.

:: ---------------------------------------------------
:: 5. Detener contenedores previos (si existen)
:: ---------------------------------------------------
echo  [4/6] Deteniendo contenedores previos...
docker-compose -f "%PROJECT_ROOT%\docker-compose.yml" down >nul 2>&1
echo  [OK] Limpieza completada
echo.

:: ---------------------------------------------------
:: 6. Construir y levantar contenedores
:: ---------------------------------------------------
echo  [5/6] Construyendo e iniciando contenedores...
echo  (Esto puede tardar varios minutos la primera vez)
echo.
docker-compose -f "%PROJECT_ROOT%\docker-compose.yml" up -d --build

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] Fallo al iniciar contenedores.
    echo  Revisa los logs: docker-compose logs
    echo.
    pause
    exit /b 1
)
echo.

:: ---------------------------------------------------
:: 7. Esperar healthchecks
:: ---------------------------------------------------
echo  [6/6] Esperando que los servicios esten listos...
set "MAX_WAIT=120"
set "INTERVAL=5"
set "ELAPSED=0"

:healthcheck_loop
if %ELAPSED% GEQ %MAX_WAIT% (
    color 0E
    echo.
    echo  [WARN] Timeout esperando servicios (%MAX_WAIT%s).
    echo  Algunos servicios pueden no estar listos.
    echo  Revisa: docker-compose ps
    goto :deploy_summary
)

:: Verificar que los 3 contenedores esten healthy
set "HEALTHY_COUNT=0"
for /f %%c in ('docker ps --filter "name=logmaster-" --filter "health=healthy" --format "{{.Names}}" 2^>nul ^| find /c /v ""') do (
    set "HEALTHY_COUNT=%%c"
)

if %HEALTHY_COUNT% GEQ 3 (
    echo  [OK] Todos los servicios estan saludables
    goto :deploy_summary
)

echo  Servicios listos: %HEALTHY_COUNT%/3 - esperando... (%ELAPSED%s/%MAX_WAIT%s)
timeout /t %INTERVAL% /nobreak >nul
set /a ELAPSED+=%INTERVAL%
goto :healthcheck_loop

:deploy_summary
echo.
echo  =============================================
echo   Deploy Completado Exitosamente
echo  =============================================
echo.
echo   IP Local:          %LOCAL_IP%
echo.
echo   URLs de Acceso:
echo     Cliente Web:     https://%LOCAL_IP%
echo     Cliente HTTP:    http://%LOCAL_IP%
echo     API Server:      http://%LOCAL_IP%:3000
echo.
echo   Comandos utiles:
echo     Ver logs:        docker-compose logs -f
echo     Detener:         scripts\detener.bat
echo     Estado:          docker-compose ps
echo.

:: Abrir navegador
echo  Abriendo navegador...
timeout /t 2 /nobreak >nul
start https://%LOCAL_IP%

echo.
pause
