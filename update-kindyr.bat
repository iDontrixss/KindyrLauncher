@echo off
REM Ejecuta pnpm update-kindyr desde cualquier carpeta
REM Uso: doble click o desde cualquier terminal: C:\KindyrLauncher\update-kindyr.bat
node "%~dp0scripts\update-kindyr.js" %*
pause
