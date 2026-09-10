@echo off
setlocal
cd /d "%~dp0"
title WeChat HTML Editor

where node.exe >nul 2>nul
if errorlevel 1 goto no_node

where npm.cmd >nul 2>nul
if errorlevel 1 goto no_node

if not exist "node_modules" (
  echo First launch: installing local dependencies...
  call npm.cmd install
  if errorlevel 1 goto install_failed
)

node.exe scripts\start-local.mjs
if errorlevel 1 goto launch_failed
exit /b 0

:no_node
echo Node.js was not found.
echo Install Node.js 20.19 or newer from https://nodejs.org/
pause
exit /b 1

:install_failed
echo Dependency installation failed. Check the network and try again.
pause
exit /b 1

:launch_failed
echo The editor could not start. The error is shown above.
pause
exit /b 1
