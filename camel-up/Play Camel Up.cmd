@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto :node_required
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=18)?0:1)"
if errorlevel 1 goto :node_required
if not exist "node_modules\qrcode\package.json" goto :install
if not exist "node_modules\.bin\vite.cmd" goto :install
goto :build
:install
echo Installing game dependencies. The first setup requires an internet connection.
call npm ci --include=dev
if errorlevel 1 goto :failed
:build
if exist "dist\index.html" goto :run
call npm run build
if errorlevel 1 goto :failed
:run
node server\index.mjs --open
if errorlevel 1 goto :failed
exit /b 0
:node_required
echo Install Node.js 22.18 or newer, then reopen this launcher.
:failed
pause
exit /b 1
