@echo off
setlocal enabledelayedexpansion

echo.
echo Monitor de Salud del Sistema - LogMaster
echo ============================================
echo.

set "HEALTHY_COUNT=0"
set "TOTAL_COUNT=0"

echo Verificando servicios Docker...
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 🌐 Verificando endpoints HTTP...

call :CheckService "PostgreSQL" "http://localhost:5432" "Base de Datos (puerto)"
call :CheckService "Servidor API" "http://localhost:3000/" "API del Servidor"
call :CheckService "Cliente Web" "http://localhost:80/" "Cliente Web"

echo.
echo 📈 Estadísticas de Salud:
echo    Servicios saludables: %HEALTHY_COUNT%/%TOTAL_COUNT%

if %HEALTHY_COUNT% equ %TOTAL_COUNT% (
    echo.
    echo 🎉 ¡Todos los sistemas están operativos!
    echo.
    echo 🌐 URLs de Acceso:
    echo    • API Server: http://localhost:3000
    echo    • Cliente Web: http://localhost:80
    echo    • Base de Datos: localhost:5432
    echo.
    echo 📊 Recursos del Sistema:
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
) else (
    echo.
    echo ⚠️  Algunos servicios necesitan atención
    echo.
    echo 🔧 Acciones recomendadas:
    echo    • Revisar logs: docker-compose logs [servicio]
    echo    • Reiniciar servicios: docker-compose restart
    echo    • Verificar configuración: docker-compose config
)

echo.
echo 📝 Logs recientes (últimas 10 líneas por servicio):
echo ----------------------------------------
docker-compose logs --tail=10 --timestamps

echo.
echo 💾 Uso de disco en volúmenes:
echo ---------------------------
docker system df -v

echo.
echo 🕐 Monitorización continuando... Presiona Ctrl+C para detener
:monitor_loop
timeout /t 30 >nul
echo.
echo 🔄 %date% %time% - Verificación automática...
call :CheckService "Servidor API" "http://localhost:3000/" "API del Servidor"
goto monitor_loop

:: ---------------------------------------------------
:: Funcion: Verificar servicio HTTP
:: ---------------------------------------------------
:CheckService
set "SERVICE_NAME=%~1"
set "SERVICE_URL=%~2"
set "SERVICE_DESC=%~3"

set /a TOTAL_COUNT+=1
echo Verificando %SERVICE_DESC%...

curl -s -f "%SERVICE_URL%" >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] %SERVICE_NAME% - Saludable
    set /a HEALTHY_COUNT+=1
) else (
    echo [FAIL] %SERVICE_NAME% - No responde
    echo    URL: %SERVICE_URL%
)
goto :eof
