@echo off
setlocal
title yourlines - opening lab
cd /d "%~dp0"

REM --- Check Node.js is available ------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install it from https://nodejs.org/ ^(LTS^) and run this again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies on first run -----------------------------------
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

REM --- Start the dev server and open the browser ---------------------------
echo.
echo   Starting yourlines at http://localhost:5173/
echo   Your browser will open automatically.
echo   Leave this window open while using the app; press Ctrl+C to stop.
echo.

call npm run dev -- --open

REM Keep the window open if the server exits with an error.
if errorlevel 1 pause
endlocal
