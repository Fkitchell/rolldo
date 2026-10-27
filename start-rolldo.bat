@echo off
cd /d "%~dp0"
start "Rolldo Server" /min cmd /c "npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
exit
