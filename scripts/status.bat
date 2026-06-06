@echo off
title LogMaster - Estado del Sistema
color 0B

echo.
echo  =============================================
echo   LOGMASTER - Estado del Sistema
echo  =============================================
echo.

:: Detectar IP
set "LOCAL_IP=localhost"
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|Docker' -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1 -ExpandProperty IPAddress" 2^>nul') do (
    set "LOCAL_IP=%%i"
)

echo.
echo  [1] Contenedores Docker:
echo  ---------------------------------------------
docker-compose ps
echo.

echo  [2] Healthchecks:
echo  ---------------------------------------------
echo   - PostgreSQL:
docker exec logmaster-postgres pg_isready -U postgres 2>nul && echo      [OK] Responde || echo      [X] No responde

echo   - API Server (http://localhost:3000/api/v1/health):
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/v1/health 2>nul | findstr "200" >nul && echo      [OK] HTTP 200 || echo      [X] No responde

echo   - Client Nginx (https://localhost/health):
curl -s -k -o nul -w "%%{http_code}" https://localhost/health 2>nul | findstr "200" >nul && echo      [OK] HTTP 200 || echo      [X] No responde

echo.
echo  [3] URLs de acceso:
echo  ---------------------------------------------
echo      Local:     http://localhost
echo      HTTPS:     https://localhost
echo      API:       http://localhost:3000/api/v1
echo      LAN:       http://%LOCAL_IP%
echo.

echo  [4] Volumenes de datos:
echo  ---------------------------------------------
docker volume ls | findstr "visitors_"
echo.

echo  =============================================
echo.
pause
