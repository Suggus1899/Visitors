@echo off
setlocal
echo PostgreSQL local: 127.0.0.1:55432
"%~dp0..\..\Visitors-local\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 55432
echo API Go:
curl --fail --silent --show-error http://127.0.0.1:3000/api/v1/health
echo.
echo Cliente:
curl --fail --silent --show-error -o nul http://localhost:5173
echo Buzon local:
curl --fail --silent --show-error -o nul http://127.0.0.1:8025
