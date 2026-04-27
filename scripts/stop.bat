@echo off
echo Stopping Unified Platform Backend...
taskkill /F /FI "WINDOWTITLE eq uvicorn*" /T
taskkill /F /IM python.exe /T
echo.
echo Backend stopped.
pause
