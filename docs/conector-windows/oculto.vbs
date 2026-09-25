' ===========================================================================
'  Abre o conector SEM janela nenhuma.
'
'  O terceiro parametro do Run e a janela: 0 = escondida. O quarto e False
'  para nao esperar o conector terminar (ele roda o dia inteiro).
'
'  Um "cmd /c" com janela minimizada ainda pisca na barra de tarefas e pode
'  ser fechado sem querer; por isso o VBScript, que nao cria janela nenhuma.
'
'  O argumento "oculto" avisa o .bat que nao existe ninguem para clicar em
'  nada: em vez de "pause", ele grava o motivo em log.txt e sai.
' ===========================================================================
Set sh = CreateObject("WScript.Shell")
pasta = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.CurrentDirectory = pasta
sh.Run """" & pasta & "iniciar-conector.bat"" oculto", 0, False
