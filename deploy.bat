@echo off
setlocal
title yourlines - deploy suite
cd /d "%~dp0"

rem Syncs every sub-app, gates on a build + a sub-app syntax check, then
rem commits+pushes yourlines. Pushing to main triggers the GitHub Actions
rem workflow that publishes https://audiophrases.github.io/yourlines/.
rem Use this after editing yourlines' own src/ directly. If you edited a
rem sub-app instead, run that app's own deploy.bat in its own repo folder.

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install it from https://nodejs.org/ ^(LTS^) and run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo   First run - installing dependencies. This can take a minute...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. See the errors above.
    echo.
    pause
    exit /b 1
  )
)

call npm run deploy

if errorlevel 1 pause
endlocal
