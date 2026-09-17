@echo off
cd /d "D:\MTS\SideProjects\rolldo"
start "Rolldo Server" /min cmd /c "npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
exit
