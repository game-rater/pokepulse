@echo off
title Open PokéPulse
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Pokepulse App Files (Leave Here)\Open-Pokepulse.ps1"
if errorlevel 1 (
  echo.
  echo PokéPulse could not start. Check that you extracted the whole ZIP folder.
  pause
)
