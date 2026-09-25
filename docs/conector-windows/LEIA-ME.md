# Conector de WhatsApp no PC da academia — Windows

Dois arquivos para pôr o conector de pé: `iniciar-conector.bat` (roda e reabre
sozinho) e `oculto.vbs` (abre sem janela nenhuma). Eles ficam **dentro da pasta
do conector**, ao lado de `conector.mjs`.

O código do conector não mora aqui: ele se atualiza sozinho pelo
`/api/bot/atualizacao`, e a versão que a academia roda está em
`conector_versoes` no banco.

## Um número por pasta

`config.json`, a pasta `sessao`, `pendentes.json` e `log.txt` são todos da pasta
onde o programa está. Segundo número no mesmo PC = **outra pasta**.

Ao copiar a pasta de um conector que já funciona, **apague na cópia**:

- `config.json` — senão a cópia sobe como o número antigo;
- `sessao` — duas cópias com a mesma sessão **derrubam** o número que estava de pé;
- `pendentes.json` — fila de mensagens do outro número;
- `log.txt` — só para não misturar o histórico.

E mude a **porta** no `iniciar-conector.bat`: o painel (onde o QR aparece — ele
não sai no terminal) escuta uma porta por cópia. 3100 para a primeira, 3101 para
a segunda, e assim por diante. Duas cópias na mesma porta: a segunda não abre o
painel, e sem painel não há como ler o QR.

## Instalar

1. Copie `iniciar-conector.bat` e `oculto.vbs` para a pasta do conector.
2. Abra o `.bat` e ajuste a linha `if "%PORT%"=="" set PORT=3101`.
3. Dê dois cliques no `.bat` **uma vez**, com janela, para conferir que sobe. Ele
   diz o endereço do painel. Qualquer falta (Node, `conector.mjs`, `painel.html`,
   dependências) aparece na tela e em `log.txt`.
4. No painel, cole os três campos do FitMind (endereço, identificador da conexão
   e segredo) e leia o QR com o celular daquele número.
5. Feche a janela e siga para o início automático.

## Início automático, sem janela

**Jeito bom — tarefa do Windows, sobe com o PC, sem ninguém logar:**

No PowerShell **como administrador**, uma vez por pasta:

```powershell
$acao = New-ScheduledTaskAction -Execute "wscript.exe" -Argument '"C:\conector-jessica\oculto.vbs"'
$gatilho = New-ScheduledTaskTrigger -AtStartup
$conf = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "Conector WhatsApp Jessica" -Action $acao -Trigger $gatilho `
        -Settings $conf -User "SYSTEM" -RunLevel Highest
```

`-User "SYSTEM"` não pede senha e sobe no boot, antes de qualquer login. O
conector não precisa de tela nem de navegador (é Baileys, não Chrome), então
roda assim sem problema, e o painel continua em `http://localhost:<porta>`.

**Jeito simples — só quando alguém loga:** tecla Windows + R, `shell:startup`, e
ponha ali um atalho do `oculto.vbs`. Serve quando o PC entra sozinho na conta.

> **Antes de ligar o automático, tire o antigo.** Se o conector que já rodava
> estava na pasta Iniciar ou em outra tarefa, remova essa entrada. Duas cópias da
> **mesma** pasta brigam pela mesma sessão e derrubam o número.

## Quando não sobe

`log.txt`, na pasta, tem a resposta. O `.bat` grava ali a data de cada abertura,
o motivo de cada parada e o código de saída.

| O que aparece | O que é |
|---|---|
| `ERRO: Node.js nao encontrado` | Node não instalado, ou fora do PATH da conta que rodou. Instale a versão LTS, ou ponha um `node.exe` na pasta. |
| `ERRO: falta conector.mjs` | A pasta não é a do conector, ou a cópia veio incompleta. |
| `AVISO: falta painel.html` | Sobe, mas o painel abre em branco e não dá para ler o QR. Copie o arquivo da pasta que funciona. |
| `ERRO: npm ci falhou` | Sem internet, ou a pasta está dentro do OneDrive (trava arquivo e dá `EPERM`). Ponha em `C:\`. |
| `saiu com codigo 42` | Normal: ele se atualizou e reabriu sozinho. |
| Painel não abre e o log não cresce | Outra cópia já está naquela porta. Troque a porta. |

O `.bat` nunca desiste: se o conector cair, ele espera 15 segundos e abre de
novo. É de propósito — no PC da academia não há ninguém olhando.
