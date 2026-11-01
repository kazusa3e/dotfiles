@echo off
setlocal

rem Set an application to 1 to copy its configuration, or 0 to skip it.
set "WEZTERM=1"
set "MACTYPE=1"
set "AUTOHOTKEY=1"
set "DOTFILES=%~dp0"
set "SCOOP=%USERPROFILE%\scoop"
set "ERRORS=0"

if "%WEZTERM%"=="1" call :copy "%DOTFILES%wezterm\.config\wezterm\wezterm.lua" "%USERPROFILE%\.wezterm.lua"
if "%AUTOHOTKEY%"=="1" call :copy "%DOTFILES%autohotkey\keybindings.ahk" "%USERPROFILE%\Documents\AutoHotkey\keybindings.ahk"

if not "%MACTYPE%"=="1" goto :summary
if defined MACTYPE_DIR goto :regular_mactype

rem Scoop installs use both the persistent config and the current app path.
if exist "%SCOOP%\apps\mactype-np\current\MacTray.exe" (
    call :copy "%DOTFILES%mactype\MacType.ini" "%SCOOP%\persist\mactype-np\MacType.ini"
    call :copy "%DOTFILES%mactype\ini\personal.ini" "%SCOOP%\persist\mactype-np\ini\personal.ini"
    call :copy "%DOTFILES%mactype\MacType.ini" "%SCOOP%\apps\mactype-np\current\MacType.ini"
    call :copy "%DOTFILES%mactype\ini\personal.ini" "%SCOOP%\apps\mactype-np\current\ini\personal.ini"
    goto :summary
)

rem Otherwise use a regular MacType installation, if present.
if exist "%ProgramFiles%\MacType\MacTray.exe" set "MACTYPE_DIR=%ProgramFiles%\MacType"
if not defined MACTYPE_DIR if exist "%ProgramFiles(x86)%\MacType\MacTray.exe" set "MACTYPE_DIR=%ProgramFiles(x86)%\MacType"
if defined MACTYPE_DIR goto :regular_mactype
echo [SKIP] MacType installation not found.
goto :summary

:regular_mactype
if not exist "%MACTYPE_DIR%\MacTray.exe" (
    echo [SKIP] MACTYPE_DIR does not contain MacTray.exe: "%MACTYPE_DIR%"
    set "ERRORS=1"
    goto :summary
)
call :copy "%DOTFILES%mactype\MacType.ini" "%MACTYPE_DIR%\MacType.ini"
call :copy "%DOTFILES%mactype\ini\personal.ini" "%MACTYPE_DIR%\ini\personal.ini"
goto :summary

:copy
if not exist "%~1" (
    echo [FAIL] Source not found: "%~1"
    set "ERRORS=1"
    exit /b
)
for %%D in ("%~2") do if not exist "%%~dpD" mkdir "%%~dpD" >nul 2>&1
copy /y "%~1" "%~2" >nul
if errorlevel 1 (
    echo [FAIL] Could not copy config: "%~2"
    set "ERRORS=1"
) else (
    echo [OK] Copied "%~2"
)
exit /b

:summary
if "%ERRORS%"=="1" exit /b 1
exit /b 0
