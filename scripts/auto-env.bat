@echo off
setlocal enabledelayedexpansion
title LogMaster - Auto-Configuracion de Entorno
color 0B

echo.
echo  =============================================
echo   LOGMASTER - Auto-Deteccion de Entorno
echo  =============================================
echo.

:: ---------------------------------------------------
:: 1. Detectar IP local automaticamente
:: ---------------------------------------------------
set "LOCAL_IP="
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|Docker' -and ($_.PrefixOrigin -eq 'Dhcp' -or $_.PrefixOrigin -eq 'Manual') -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Sort-Object -Property InterfaceMetric | Select-Object -First 1).IPAddress"') do (
    set "LOCAL_IP=%%i"
)

if "%LOCAL_IP%"=="" (
    echo  [WARN] No se detecto IP de red activa.
    echo  Usando localhost como fallback.
    set "LOCAL_IP=localhost"
)

echo  IP detectada: %LOCAL_IP%
echo.

:: ---------------------------------------------------
:: 2. Determinar directorio raiz del proyecto
:: ---------------------------------------------------
set "PROJECT_ROOT=%~dp0.."
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

:: ---------------------------------------------------
:: 3. Asegurar que .env existe
:: ---------------------------------------------------
set "ENV_FILE=%PROJECT_ROOT%\.env"
set "ENV_EXAMPLE=%PROJECT_ROOT%\.env.example"

if not exist "%ENV_FILE%" (
    if exist "%ENV_EXAMPLE%" (
        copy "%ENV_EXAMPLE%" "%ENV_FILE%" >nul
        echo  [OK] .env creado desde .env.example
    ) else (
        echo  [ERROR] No se encontro .env ni .env.example
        pause
        exit /b 1
    )
)

:: ---------------------------------------------------
:: 4. Actualizar variables en .env
:: ---------------------------------------------------
echo  Actualizando .env con IP: %LOCAL_IP%...

:: Usar PowerShell para reemplazos robustos en .env
powershell -NoProfile -Command ^
  "$file = '%ENV_FILE%';" ^
  "$content = Get-Content $file -Raw;" ^
  "$ip = '%LOCAL_IP%';" ^
  "" ^
  "# APP_URL" ^
  "$content = $content -replace '(?m)^APP_URL=.*$', \"APP_URL=http://${ip}:80\";" ^
  "" ^
  "# ALLOWED_ORIGINS (para CORS en LAN)" ^
  "if ($content -notmatch '(?m)^ALLOWED_ORIGINS=') {" ^
  "  $content += \"`nALLOWED_ORIGINS=http://${ip}:80,http://${ip}:5173,https://${ip}:443,https://${ip}`n\";" ^
  "  Write-Host '  [OK] ALLOWED_ORIGINS agregado al .env';" ^
  "} else {" ^
  "  $content = $content -replace '(?m)^ALLOWED_ORIGINS=.*$', \"ALLOWED_ORIGINS=http://${ip}:80,http://${ip}:5173,https://${ip}:443,https://${ip}\";" ^
  "  Write-Host '  [OK] ALLOWED_ORIGINS actualizado';" ^
  "}" ^
  "" ^
  "Set-Content $file $content -NoNewline;" ^
  "Write-Host '  [OK] APP_URL actualizado';"

echo.
echo  =============================================
echo   Configuracion Completada
echo  =============================================
echo.
echo   IP Local:          %LOCAL_IP%
echo   Archivo .env:      %ENV_FILE%
echo.
echo   URLs de acceso (despues de iniciar Docker):
echo     Cliente Web:     http://%LOCAL_IP%
echo     Cliente HTTPS:   https://%LOCAL_IP%
echo     API Server:      http://%LOCAL_IP%:3000
echo     API Docs:        http://%LOCAL_IP%:3000/api-docs
echo.
echo   NOTA: En Docker, VITE_API_URL debe estar vacio
echo   (nginx hace proxy inverso a /api). No se modifica.
echo.
pause
