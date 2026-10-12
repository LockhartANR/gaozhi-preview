@echo off
setlocal

rem ---- locate the single-file app under dist\ (skip index.html) ----
set "APP="
for %%F in ("%~dp0dist\*.html") do (
  if /i not "%%~nxF"=="index.html" if not defined APP if exist "%%~fF" set "APP=%%~fF"
)

if not defined APP (
  echo [ERROR] No standalone HTML found in dist\
  echo.
  echo Build it first:
  echo     pnpm build
  echo     node scripts/build-standalone.mjs
  echo.
  pause
  exit /b 1
)

rem ---- locate a Chromium browser for app mode ----
set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P"
)

if /i "%~1"=="--dry-run" (
  echo APP=%APP%
  echo BROWSER=%BROWSER%
  exit /b 0
)

if not defined BROWSER (
  echo No Chrome or Edge found -- opening with the default browser.
  start "" "%APP%"
  exit /b 0
)

rem D:\a\b.html  ->  file:///D:/a/b.html
set "URL=file:///%APP:\=/%"
start "" "%BROWSER%" --app="%URL%"
exit /b 0
