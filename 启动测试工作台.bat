@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Campus Testing Workbench

rem Use the existing launcher; do not kill occupied ports or install dependencies.
where node.exe >nul 2>&1
if errorlevel 1 goto missingNode
where pnpm >nul 2>&1
if errorlevel 1 goto missingPnpm

if not exist "%~dp0qinglan-scenic\scripts\dev-testing.mjs" goto missingProject
if not exist "%~dp0zhixing-campus\package.json" goto missingProject
if not exist "%~dp0qinglan-scenic\node_modules\" goto missingDependencies
if not exist "%~dp0zhixing-campus\node_modules\" goto missingDependencies

pushd "%~dp0qinglan-scenic"
if errorlevel 1 goto directoryError
echo ============================================================
echo   Testing Workbench + Campus Services
echo ============================================================
echo   Workbench:       http://localhost:5180/
echo   Public display:  http://localhost:5500/
echo   Ops display:     http://localhost:5501/
echo   Student portal:  http://localhost:5502/
echo   Teacher portal:  http://localhost:5503/
echo   Admin portal:    http://localhost:5504/
echo   Booking service: http://localhost:5606/
echo.
echo Starting services. Wait for the launcher to report readiness.
echo Keep this window open while using newly started services.
echo Press Ctrl+C to stop services created by this launcher.
echo Existing verified services will be reused and left running.
echo.
call pnpm dev:testing
set "LAUNCH_EXIT=%ERRORLEVEL%"
popd
echo.
if not "%LAUNCH_EXIT%"=="0" goto launchError
echo Launcher finished normally. See the readiness logs above.
echo If existing services were reused, they remain running.
pause
exit /b 0

:missingNode
echo [ERROR] Node.js was not found. Install a project-compatible Node.js version.
echo Then reopen this batch file.
goto failed

:missingPnpm
echo [ERROR] pnpm was not found. Install pnpm 10.17.1 first:
echo   npm install -g pnpm@10.17.1
goto failed

:missingProject
echo [ERROR] Project files are missing. Keep this batch file in the workspace root,
echo beside the qinglan-scenic and zhixing-campus folders.
goto failed

:missingDependencies
echo [ERROR] Dependencies are missing. Run these commands first:
echo   cd /d "%~dp0qinglan-scenic"
echo   pnpm install --frozen-lockfile
echo   cd /d "%~dp0zhixing-campus"
echo   pnpm install --frozen-lockfile
goto failed

:directoryError
echo [ERROR] Cannot enter the qinglan-scenic project directory.
goto failed

:launchError
echo [ERROR] Startup failed with exit code %LAUNCH_EXIT%.
echo Check the logs above for port conflicts or missing dependencies.
echo No existing process is forcibly terminated by this batch file.
pause
exit /b %LAUNCH_EXIT%

:failed
pause
exit /b 1
