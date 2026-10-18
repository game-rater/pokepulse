@echo off
chcp 65001 >nul
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0Start PokéPulse.ps1"
