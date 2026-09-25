@echo off
rem ===========================================================================
rem  Conector de WhatsApp da FitMind - inicio no PC da academia.
rem
rem  Um numero por pasta. Para um segundo numero no mesmo PC, copie a pasta do
rem  conector SEM config.json, SEM a pasta sessao e SEM pendentes.json, e mude
rem  a PORTA aqui embaixo. Duas copias na mesma porta nao abrem o painel, e
rem  duas copias com a MESMA sessao derrubam o numero que ja estava de pe.
rem
rem  Roda de dois jeitos, e descobre sozinho qual e o caso:
rem    1. FitMindConector.exe, que ja traz o Node dentro;
rem    2. conector.mjs com o Node da maquina.
rem
rem  Este arquivo nao usa "pause" quando roda escondido (oculto.vbs passa o
rem  argumento "oculto"): janela invisivel parada esperando um clique e um
rem  conector que nunca sobe e ninguem ve.
rem
rem  Tudo o que acontece fica em log.txt, ao lado deste arquivo.
rem ===========================================================================
setlocal
cd /d "%~dp0"

rem ---- PORTA DO PAINEL: 3100 na pasta da Estacao, 3101 na da Jessica --------
if "%PORT%"=="" set PORT=3101

set "LOG=%~dp0log.txt"
echo.>> "%LOG%"
echo ===== %date% %time% - abrindo com PORT=%PORT%>> "%LOG%"

rem ---- 1) o executavel proprio, quando existe ------------------------------
set "EXE="
if exist "%~dp0FitMindConector.exe" set "EXE=%~dp0FitMindConector.exe"
if exist "%~dp0conector.exe" set "EXE=%~dp0conector.exe"

rem ---- 2) o Node, para rodar o conector.mjs --------------------------------
rem  A ordem importa: o node.exe da propria pasta primeiro, porque e o unico
rem  que continua valendo quando a tarefa roda como SYSTEM, que tem outro PATH.
set "NODE="
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
if defined NODE goto achou_node
where node >nul 2>&1
if not errorlevel 1 set "NODE=node"
if defined NODE goto achou_node
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if defined NODE goto achou_node
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if defined NODE goto achou_node
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined NODE goto achou_node
if exist "C:\nodejs\node.exe" set "NODE=C:\nodejs\node.exe"
:achou_node

rem ---- 3) decide o que abrir ----------------------------------------------
rem  Com Node e conector.mjs na pasta, prefere esse caminho: e o arquivo que a
rem  atualizacao automatica reescreve. O .exe e o caminho de quem nunca teve
rem  Node instalado na maquina.
if defined NODE if exist "%~dp0conector.mjs" goto modo_node
if defined EXE goto modo_exe
if not exist "%~dp0conector.mjs" goto sem_programa
echo Achei conector.mjs, mas nao achei o Node para rodar ele.
echo Instale a versao LTS em https://nodejs.org, ou copie o node.exe para esta pasta.
echo ERRO: conector.mjs sem Node>> "%LOG%"
goto parar

:sem_programa
echo Nao achei o conector nesta pasta:
echo   %~dp0
echo Esperava FitMindConector.exe ou conector.mjs. Copie a pasta do conector
echo que ja funciona (sem config.json, sem a pasta sessao e sem pendentes.json).
echo ERRO: sem FitMindConector.exe e sem conector.mjs>> "%LOG%"
echo --- o que tem na pasta: ---->> "%LOG%"
dir /b "%~dp0" >> "%LOG%" 2>&1
goto parar

rem ---- modo executavel -----------------------------------------------------
:modo_exe
echo Conector no ar pelo executavel. Painel: http://localhost:%PORT%
echo usando %EXE%>> "%LOG%"
:abrir_exe
"%EXE%" >> "%LOG%" 2>&1
set CODIGO=%errorlevel%
echo saiu com codigo %CODIGO% em %date% %time%>> "%LOG%"
if "%CODIGO%"=="42" goto abrir_exe
timeout /t 15 /nobreak >nul
goto abrir_exe

rem ---- modo Node -----------------------------------------------------------
:modo_node
if exist "%~dp0painel.html" goto tem_painel
echo AVISO: falta painel.html - o painel abre em branco e nao da para ler o QR.
echo AVISO: falta painel.html>> "%LOG%"
:tem_painel
if exist "%~dp0node_modules" goto abrir_node
echo Primeira vez nesta pasta: baixando as dependencias. Precisa de internet.
echo instalando dependencias>> "%LOG%"
call npm ci --omit=dev >> "%LOG%" 2>&1
if not errorlevel 1 goto abrir_node
echo Nao consegui baixar as dependencias. Abra log.txt para ver o motivo.
echo ERRO: npm ci falhou>> "%LOG%"
goto parar

:abrir_node
echo Conector no ar. Painel: http://localhost:%PORT%
echo usando %NODE%>> "%LOG%"
"%NODE%" "%~dp0conector.mjs" >> "%LOG%" 2>&1
set CODIGO=%errorlevel%
echo saiu com codigo %CODIGO% em %date% %time%>> "%LOG%"
rem 42 = o conector se atualizou e pediu para ser reaberto.
if "%CODIGO%"=="42" goto abrir_node
rem Qualquer outro codigo e queda. Espera e tenta de novo: no PC da academia
rem nao ha ninguem olhando, e parar de vez significa ficar sem robo ate alguem
rem reparar dias depois.
timeout /t 15 /nobreak >nul
goto abrir_node

:parar
if "%1"=="oculto" exit /b 1
echo.
pause
exit /b 1
