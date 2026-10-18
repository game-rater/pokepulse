@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo PokéThreat Meter - Manual Matchup
echo Open http://127.0.0.1:3000 after the server starts.
if exist "%~dp0node.exe" goto bundled
where /q node.exe
if not errorlevel 1 goto installed
echo Node.js 20 or newer was not found.
pause
exit /b 1
:bundled
"%~dp0node.exe" "%~dp0server.mjs"
goto done
:installed
node.exe "%~dp0server.mjs"
:done
pause
