@echo off
cd /d "%~dp0"
echo PokeThreat Run and Bun - Automatic Preview
echo Open http://127.0.0.1:3001/ after the server starts.
if exist "%~dp0node.exe" goto bundled
if exist "%~dp0dist\Run-and-Bun-Automatic\node.exe" goto project
where /q node.exe
if not errorlevel 1 goto installed
echo.
echo Node runtime was not found. Extract the entire Windows ZIP first.
echo Keep this launcher beside node.exe and the run-bun folder.
goto done
:bundled
"%~dp0node.exe" "%~dp0run-bun\server.mjs"
goto done
:project
"%~dp0dist\Run-and-Bun-Automatic\node.exe" "%~dp0run-bun\server.mjs"
goto done
:installed
node "%~dp0run-bun\server.mjs"
:done
pause
