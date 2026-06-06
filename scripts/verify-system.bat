@echo off
setlocal enabledelayedexpansion
title LogMaster - Verificacion Completa
color 0E

echo.
echo  =============================================
echo   LOGMASTER - VERIFICACION DEL SISTEMA
echo  =============================================
echo.

:: Detectar IP
set "LOCAL_IP=localhost"
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|Docker' -and $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1 -ExpandProperty IPAddress" 2^>nul') do (
    set "LOCAL_IP=%%i"
)

set "TESTS_PASSED=0"
set "TESTS_TOTAL=0"

call :test "Contenedores Docker activos" "docker ps | findstr logmaster-" "0"
call :test "PostgreSQL responde" "docker exec logmaster-postgres pg_isready -U postgres" "0"
call :test "API Health endpoint" "curl -s -f http://localhost:3000/api/v1/health" "0"
call :test "Client Nginx responde" "curl -s -fk https://localhost/health" "0"
call :test "Login endpoint (seed user)" "curl -s -X POST http://localhost:3000/api/v1/auth/login -H Content-Type: application/json -d {\"cedula\":\"1234567890\",\"password\":\"admin123\"} | findstr token" "0"

echo.
echo  =============================================
echo   RESULTADO: !TESTS_PASSED!/!TESTS_TOTAL! pruebas pasadas
echo  =============================================
echo.

if !TESTS_PASSED! equ !TESTS_TOTAL! (
    color 0A
    echo   [OK] Sistema completamente funcional!
    echo.
    echo   Acceso:
    echo      Local:  http://localhost / https://localhost
    echo      Red:    http://%LOCAL_IP%
) else (
    color 0C
    echo   [X] Algunas pruebas fallaron. Revisa los logs:
    echo      scripts\monitor-health.bat
    echo      docker-compose logs
)

echo.
echo   Credenciales de prueba (seed):
    echo      Admin:  1234567890 / admin123
    echo      Guard:  0987654321 / guard123

echo.
pause
goto :eof

:test
set /a TESTS_TOTAL+=1
echo  [Test %TESTS_TOTAL%] %~1 ...
%~2 >nul 2>&1
if %ERRORLEVEL% equ %~3 (
    echo      [OK] PASSED
    set /a TESTS_PASSED+=1
) else (
    echo      [X] FAILED
)
goto :eof
