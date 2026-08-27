@echo off
setlocal
chcp 65001 >nul
set "CLEAN_VIDEO_INSTALL_SCRIPT=%~dp0install-windows.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$bytes = [IO.File]::ReadAllBytes($env:CLEAN_VIDEO_INSTALL_SCRIPT); $text = [Text.Encoding]::UTF8.GetString($bytes); $script = [ScriptBlock]::Create($text); & $script -SourceRoot ([IO.Path]::GetDirectoryName($env:CLEAN_VIDEO_INSTALL_SCRIPT))"
set "CLEAN_VIDEO_INSTALL_EXIT=%ERRORLEVEL%"
endlocal & exit /b %CLEAN_VIDEO_INSTALL_EXIT%
