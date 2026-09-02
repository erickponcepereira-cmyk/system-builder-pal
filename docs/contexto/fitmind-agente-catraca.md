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

## 01/09/2026 — desativar computador virou botão, e a aba parou de mentir

O pareamento antigo continuava valendo depois de reinstalar o agente. Isso não
era detalhe: as **onze** funções que o programa chama exigem
`ativo AND segredo_hash = ...` (conferido uma a uma no `prosrc`), então o segredo
de uma máquina aposentada abre catraca até alguém desligar a linha. Já houve três
"PC da recepcao" vivos ao mesmo tempo, desligados direto no banco — caminho que o
Erick não tem, porque não existe console do Supabase para ele.

Agora há `desativarAgente` em `academia-teste.functions.ts` e um botão em cada
computador pareado, com confirmação que diz o que acontece ("se for a máquina em
uso, a catraca para"). O filtro do update leva `partner_id` além do `id`, então um
id de agente de outra academia não é desativado por quem só tem acesso a esta —
conferido com a consulta equivalente, que dá zero atravessando e um na própria.
**Não apaga a linha**: o histórico é o que responde desde quando cada computador
teve acesso.

Junto saíram dois estados velhos que a aba mostrava como se fossem de agora:

- **Computador desativado aparecia em vermelho**, porque a lista filtrava por
  `pareado_em` e não por `ativo`, e sem contato recente o cartão vai para
  `tom="critico"`. O comentário do próprio arquivo diz que vermelho ali é o único
  estado que manda alguém andar até a recepção — ou seja, máquina aposentada
  mandava gente correr à toa. Desativados agora saem numa linha discreta.
- **Código de pareamento expirado contava como "aguardando instalação".** O
  código vale 30 minutos; havia um de 15/08 ainda sendo anunciado em 01/09.

Verificado: `tsc --noEmit` limpo, a guarda `ativo` conferida função a função, e o
filtro por academia provado por consulta. **Não exercitei o botão no navegador** —
o painel exige login e o dev server tem as armadilhas de sempre.

## 02/09/2026 — a aba de instalação passa a entregar pacote, não arquivo solto

Antes a aba baixava **um arquivo por clique** — cinco para o agente — e errar um
deixava a pasta pela metade sem avisar. E o texto da própria tela dizia que aquilo
não era o instalador: o Node, o `node_modules`, os `.exe`, os `.bat` e os ícones
"continuam vindo por cópia de uma instalação que já existe".

Agora são dois downloads por programa, em `/api/instalacao/pacote`:

- **`tipo=codigo`** monta o zip na hora, dentro do Worker, com `fflate`. São ~124
  kB de texto na 1.27.00, então é barato. A view do fflate é recortada para um
  `ArrayBuffer` exato antes de virar corpo da resposta — mandar a view inteira
  entregaria bytes a mais no fim do arquivo.
- **`tipo=base`** não devolve bytes: devolve **URL assinada de 5 minutos** para o
  bucket privado `instalacao`. São dezenas de MB de binário e o Worker não tem
  memória para isso; o storage serve sozinho e o download nem passa pela aplicação.

**O pacote base é o sistema completo**, e é isso que fecha a aba: instalado, o
programa se auto-atualiza até a versão de hoje. Um base "velho" continua servindo
porque ele é o ponto de partida, não a versão final. Quem envia é o **suporte**
(`profiles.is_master_admin`), por upload direto do navegador para o storage com
URL assinada — o arquivo não atravessa o servidor. Enquanto ninguém enviar, a aba
mostra o aviso antigo e só oferece o código; enviado, o aviso some sozinho.

Os binários **não estão neste repositório nem em bucket nenhum** — moram em
`C:\dev\fitmind-catraca` e no `C:\dev\fitmind-agente-catraca.zip`, no PC do Erick.
Por isso a aba ficou pronta e vazia: falta subir o arquivo uma vez, por programa.

Provado com os caminhos reais da 1.27.00 (`agente.mjs`, `lib/estado.mjs`,
`lib/nuvem.mjs`, `lib/rosto.mjs`, `painel.html`): assinatura PK correta, os cinco
voltam byte a byte na descompactação, a subpasta `lib/` se mantém, e o recorte do
buffer bate com a view. `tsc --noEmit` limpo. A tela não foi exercitada no
navegador.

### Armadilha nova: o `vite build` estoura a memória

Com `mcpPlugin()` comentado o build **anda, mas morre** em
`FATAL ERROR: Ineffective mark-compacts near heap limit` — o heap padrão de 2 GB
não dá conta deste projeto. O que salva: **`routeTree.gen.ts` é gerado antes do
estouro**, e é só para isso que se roda o build. Ou seja, para registrar uma rota
nova basta rodar, ignorar o erro no fim e conferir se a rota apareceu no arquivo.
Se um dia precisar do build inteiro, aumentar o heap:
`NODE_OPTIONS=--max-old-space-size=4096`.

Continua valendo o resto da regra: restaurar o `vite.config.ts` depois, **nunca**
commitá-lo alterado, e **não** rodar `git checkout` no `routeTree.gen.ts` depois
do build, senão reverte o que acabou de ser gerado.
