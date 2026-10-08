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
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V' -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1 -ExpandProperty IPAddress" 2^>nul') do (
    set "LOCAL_IP=%%i"
)

echo.
echo  [1] PostgreSQL:
echo  ---------------------------------------------
pg_isready -h localhost -p 5432 2>nul && echo      [OK] Responde || echo      [X] No responde

echo.
echo  [2] API Server (http://localhost:3000):
echo  ---------------------------------------------
curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/v1/health 2>nul | findstr "200" >nul && echo      [OK] HTTP 200 || echo      [X] No responde

echo.
echo  [3] Cliente (http://localhost:5173):
echo  ---------------------------------------------
curl -s -o nul -w "%%{http_code}" http://localhost:5173 2>nul | findstr "200" >nul && echo      [OK] HTTP 200 || echo      [X] No responde

echo.
echo  [4] URLs de acceso:
echo  ---------------------------------------------
echo      Local:     http://localhost:5173
echo      API:       http://localhost:3000/api/v1
echo      LAN:       http://%LOCAL_IP%:5173
echo.

echo  =============================================
echo.
pause
