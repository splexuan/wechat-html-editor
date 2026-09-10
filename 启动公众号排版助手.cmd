@echo off
setlocal
cd /d "%~dp0"
title WeChat HTML Editor

rem 单文件版：不需要 Node.js，不需要联网，直接双击即可使用。
rem 用通配符定位 dist 下的 HTML，避免在批处理里写中文路径造成编码问题。
set "SINGLE_FILE="
for %%f in ("%~dp0dist\*.html") do if not defined SINGLE_FILE set "SINGLE_FILE=%%~ff"

if defined SINGLE_FILE (
  start "" "%SINGLE_FILE%"
  exit /b 0
)

echo Single-file build was not found.
echo Run "npm run build" once to generate it, or use START.cmd for dev mode.
echo.
pause
exit /b 1
