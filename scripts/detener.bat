@echo off
title LogMaster - Deteniendo...
color 0E
echo.
echo  =============================================
echo   LOGMASTER - Sistema de Control de Acceso
echo  =============================================
echo.
echo  Deteniendo contenedores Docker...
echo.

docker-compose down

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  ERROR: No se pudo detener correctamente.
    echo.
    pause
    exit /b 1
)

echo.
echo  =============================================
echo   Sistema detenido correctamente
echo  =============================================
echo.
echo   Los datos (base de datos y fotos) se
echo   conservan en los volumenes de Docker.
echo.
pause
