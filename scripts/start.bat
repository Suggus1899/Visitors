@echo off
setlocal
cd /d "%~dp0.."
call pnpm local:start
exit /b %ERRORLEVEL%
