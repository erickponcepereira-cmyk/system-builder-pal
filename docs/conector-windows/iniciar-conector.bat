@echo off
rem ===========================================================================
rem  Conector de WhatsApp da FitMind - inicio no PC da academia.
rem
rem  Um numero por pasta. Para um segundo numero no mesmo PC, copie a pasta do
rem  conector SEM config.json, SEM a pasta sessao e SEM pendentes.json, e mude
rem  a PORTA aqui embaixo. Duas copias na mesma porta nao abrem o painel, e
rem  duas copias com a MESMA sessao derrubam o numero que ja estava de pe.
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

rem ---- acha o Node ---------------------------------------------------------
set "NODE="
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
if defined NODE goto tem_node
where node >nul 2>&1
if not errorlevel 1 set "NODE=node"
:tem_node
if defined NODE goto tem_arquivos
echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org
echo ERRO: Node.js nao encontrado>> "%LOG%"
goto parar

rem ---- confere o que o conector precisa ------------------------------------
:tem_arquivos
if exist "%~dp0conector.mjs" goto tem_conector
echo Nao achei conector.mjs nesta pasta:
echo   %~dp0
echo Copie a pasta do conector que ja funciona e tente de novo.
echo ERRO: falta conector.mjs>> "%LOG%"
goto parar

:tem_conector
if exist "%~dp0painel.html" goto tem_painel
echo AVISO: falta painel.html - o painel abre em branco e nao da para ler o QR.
echo AVISO: falta painel.html>> "%LOG%"

:tem_painel
if exist "%~dp0node_modules" goto abrir
echo Primeira vez nesta pasta: baixando as dependencias. Precisa de internet.
echo instalando dependencias>> "%LOG%"
call npm ci --omit=dev >> "%LOG%" 2>&1
if not errorlevel 1 goto abrir
echo Nao consegui baixar as dependencias. Abra log.txt para ver o motivo.
echo ERRO: npm ci falhou>> "%LOG%"
goto parar

rem ---- roda, e reabre sozinho ----------------------------------------------
:abrir
echo Conector no ar. Painel: http://localhost:%PORT%
"%NODE%" "%~dp0conector.mjs" >> "%LOG%" 2>&1
set CODIGO=%errorlevel%
echo saiu com codigo %CODIGO% em %date% %time%>> "%LOG%"
rem 42 = o conector se atualizou e pediu para ser reaberto.
if "%CODIGO%"=="42" goto abrir
rem Qualquer outro codigo e queda. Espera e tenta de novo: no PC da academia
rem nao ha ninguem olhando, e parar de vez significa ficar sem robo ate alguem
rem reparar dias depois.
timeout /t 15 /nobreak >nul
goto abrir

:parar
if "%1"=="oculto" exit /b 1
pause
exit /b 1
