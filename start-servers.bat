@echo off
REM Start backend server
echo Starting backend...
cd /d C:\Users\smurf\Downloads\Luminaris\server
start "Backend - Luminaris" cmd /k npm run dev

REM Wait 8 seconds
timeout /t 8 /nobreak

REM Start frontend server
echo Starting frontend...
cd /d C:\Users\smurf\Downloads\Luminaris\my-app
start "Frontend - Luminaris" cmd /k npm run dev

echo.
echo Both servers should now be starting in separate windows.
echo Frontend: http://localhost:3000
echo Backend: http://localhost:3001
echo.
pause
