---
name: fitmind-agente-catraca
description: "O programa que roda no PC da academia: onde fica, como parear, e a regra de que ele é mínimo e sem dados sensíveis"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e4322ed-4790-4527-8909-cd39a08137f1
  modified: 2026-08-14T00:22:06.021Z
---

Criado em 12/08/2026, em `C:\dev\fitmind-catraca` (não é repositório Git).
Distribuído como `C:\dev\fitmind-agente-catraca.zip`.

**Só a catraca fica no PC.** O robô de WhatsApp vai para servidor, porque não
depende de porta local. A decisão do Erick: a peça local tem que ser mínima,
burra e sem dados sensíveis, para ninguém fazer engenharia reversa e replicar o
sistema. Isso não é preferência estética — é requisito comercial.

**O retrato que ele baixa tem duas colunas:** o identificador que o leitor
conhece e a última data em que a pessoa pode entrar. A carência já vem somada
pelo servidor, então o agente **não sabe** o que é carência, mensalidade ou
bloqueio — ele compara data com hoje. Toda a régua fica no banco.

O `solution-serial-controller.mjs` é **byte-idêntico** ao provado no ferro
(SHA-256 `6df0a5778777f24f…`). Não reescrever: ver [[catraca-solution-protocolo]].

Pareamento: a academia gera um código de 8 letras em Academia (teste) → Agente
da catraca; o operador digita no painel local (`localhost:3400`). Uso único, 30
minutos, e o resgate devolve um segredo que fica só no PC — no banco só o hash.

Funções de nuvem: `academia_agente_parear`, `academia_agente_retrato`,
`academia_agente_enviar`, autenticadas pelo próprio segredo porque o programa
não tem login de usuário. Ver [[fitmind-vertical-acesso]].

Rodou no PC da academia pela primeira vez em 17/08/2026 e o cadastro de rosto
por foto foi provado no ferro — ver [[fitmind-leitor-idface]]. A rota `/estado`
é legível de qualquer máquina da LAN; as outras são só localhost.

Ainda não feito: o agente não recebe evento do iDFace sozinho (a rota
`/identificar` existe e funciona, mas nada aponta para ela ainda) e a fila de
fotos só é drenada dentro do `sincronizar()`, cujo laço automático é de **12
horas** — na prática depende do botão "Sincronizar agora". Não apaga
rosto no equipamento por conta própria fora do prazo de exclusão.

**Requisito de 18/08/2026: o agente tem que virar programa de verdade.** Nada de
CMD na tela, nada de o operador procurar `INSTALAR.bat` em `C:\`. O alvo é o que
o Next Fit já faz: ícone, atalho, janela própria, autostart. O lançador precisa
subir o agente sem console, servir de watchdog (o `.bat` de hoje só relança no
código 42) e abrir o painel em janela de aplicativo, não em aba de navegador.

Isso tem uma consequência de arquitetura: **o lançador não pode ser atualizado
pela auto-atualização** — `.bat` e `.exe` estão fora da lista branca de
propósito, para uma atualização não conseguir escrever no autostart do cliente.
Então o lançador é instalado uma vez e quase não muda; o miolo continua se
atualizando sozinho. Desenhar com essa separação desde o começo.

## 19/08/2026 — virou programa, e a catraca girou por ele

O requisito de 18/08 foi cumprido: `FitMindCatraca.exe` (36 KB, compilado com o
`csc.exe` do próprio Windows), sem CMD e sem `.bat` à vista, com ícone, watchdog
e autostart por atalho. Instalado no PC da academia em 19/08 e pareado.

**A prova que faltava desde 12/08 saiu às 19:54:** rosto → agente → régua →
COM4 → catraca girando, e a frequência chegou em `academia_frequencias`. Os dois
elos que nunca tinham sido exercitados fecharam na mesma passagem.

Rotas novas do painel: `/modo` (trocar observação ↔ ativo pela tela),
`/catraca/testar` (abre e fecha a COM4 sem escrever o `0x4C`, para saber se o
Next Fit já soltou a porta) e `/liberar` (liberação manual da recepção, com
identificador opcional — com ele a entrada vira frequência, sem ele a catraca
gira e não fica no nome de ninguém).

**A ordem do cutover é assumir → ativo → fechar o Next Fit.** Fechar antes
derruba o leitor: em observação o agente respondia identificação no formato do
**batimento**, o leitor exibia erro de comunicação e parava de publicar,
continuando a reconhecer rosto só no log local. Cada rota tem a sua forma de
resposta. Corrigido na 1.10.00.

Ainda sem rodar no ferro: liberação manual, cadastro de rosto pela câmera do
leitor (`remoteEnrollFace`), negativa em modo ativo, autostart depois de
reiniciar o PC e o watchdog nesta máquina.
