@echo off
setlocal enabledelayedexpansion
title LogMaster - Inicio
color 0A

echo.
echo  =============================================
echo   LOGMASTER - Sistema de Control de Acceso
echo  =============================================
echo.

:: ---------------------------------------------------
:: 1. Verificar .env
:: ---------------------------------------------------
echo  [1/4] Verificando configuracion...
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo       [OK] .env creado desde .env.example
        echo       [WARN] Edita .env con tu contrasena de PostgreSQL antes de continuar.
    ) else (
        color 0C
        echo  [ERROR] No se encontro .env ni .env.example
        pause
        exit /b 1
    )
) else (
    echo       [OK] .env encontrado
)

:: ---------------------------------------------------
:: 2. Verificar PostgreSQL
:: ---------------------------------------------------
echo.
echo  [2/4] Verificando PostgreSQL...
where psql >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] PostgreSQL no esta instalado o no esta en el PATH.
    echo  Instala PostgreSQL o agrega su carpeta bin al PATH.
    pause
        exit /b 1
)
echo       [OK] PostgreSQL encontrado

:: ---------------------------------------------------
:: 3. Verificar dependencias
:: ---------------------------------------------------
echo.
echo  [3/4] Verificando dependencias...
if not exist "node_modules" (
    echo       Instalando dependencias raiz...
    call npm install
)
if not exist "server\node_modules" (
    echo       Instalando dependencias del servidor...
    cd server && call npm install && cd ..
)
if not exist "client\node_modules" (
    echo       Instalando dependencias del cliente...
    cd client && call npm install && cd ..
)
echo       [OK] Dependencias listas

:: ---------------------------------------------------
:: 4. Iniciar servidor y cliente
:: ---------------------------------------------------
echo.
echo  [4/4] Iniciando servicios...
echo       Servidor: http://localhost:3000
echo       Cliente:  http://localhost:5173
echo.
echo   Credenciales de prueba:
echo      Root:      trebolmaster / TrebolMaster2026!
echo      Admin:     Admin@trebol.com / Trebol123*
echo      Operador:  operador / Operador2026!
echo      Auditor:   auditor / Audit2026!@#
echo      Demo:      demo / Demo123!@#
echo.
echo   Presiona Ctrl+C para detener.
echo.

call npm run dev
