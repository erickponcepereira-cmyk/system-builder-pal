---
name: fitmind-como-trabalhar
description: "O método de trabalho no FitMind: os dois caminhos de escrita, a disciplina do md5, e onde ficam os documentos de contexto"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 51999e15-d33b-440c-8408-f96e37a47d58
  modified: 2026-08-28T03:25:37.021Z
---

Dois caminhos de escrita, e só dois. **Código**: editar em `C:\dev\fitmind-bugs`
e `git push` — o Lovable sincroniza e publica, sem gastar crédito. **Banco**:
MCP do Lovable, projeto `57e54ea4-86cc-4948-814d-71b2815329a0`. O Erick **não
tem console do Supabase**; nunca peça para ele rodar SQL. O MCP do Supabase
desta máquina aponta para outro projeto e não serve.

**Why:** perder tempo procurando um terceiro caminho, ou pedir ao Erick algo que
ele não pode fazer, trava o trabalho.

**Sempre que pedir uma ação sobre um arquivo, dê o caminho completo.** "Copie o
`.env`" sem dizer onde faz o Erick procurar; `C:\dev\fitmind-bugs\.env` resolve na
hora. Vale para arquivo, pasta e comando — o caminho é parte do pedido, não um
detalhe que ele descobre depois.

**E confira o caminho antes de citá-lo.** Em 01/09 eu disse que o `.env` ficava
fora do repo e precisava ser copiado entre máquinas. Ele **está versionado** — o
clone traz. Um `ls` teria evitado. As sete chaves dele são todas públicas
(`*_PUBLISHABLE_KEY`, `VITE_MP_PUBLIC_KEY`, URL e project id; tudo `VITE_` vai
para o bundle do navegador de qualquer jeito), então estar no repo não é
vazamento — mas a afirmação errada mandou o Erick procurar o que não existia.

**How to apply:** antes de qualquer entrega, `node
node_modules\typescript\bin\tsc --noEmit` — linha de base 0 erros, desde que o
`node_modules` esteja completo. Depois de aplicar SQL pelo MCP, conferir
`md5(prosrc)` contra o corpo no arquivo da migration: nas primeiras vezes
divergiu em três de três. **Compare normalizando o fim de linha** — o banco
guarda o corpo em LF e `core.autocrlf=true` deixa o arquivo em CRLF no disco,
então comparar o arquivo cru nunca bate e a conferência vira ritual vazio.
Depois de publicar
versão do agente, conferir `md5` de cada arquivo publicado contra o disco —
publicar uma versão quebrada prende o agente, porque a versão instalada passa a
bater com a publicada e ele nunca mais busca correção. A saída é bump.

Desde 28/08/2026 existe `C:\dev\fitmind-bugs\CLAUDE.md` (ainda não commitado), que já
carrega em todo turno: comando de verificação e linha de base, padrões de código, o
checklist de "quem importa este arquivo", as armadilhas de ambiente e as regras de RLS.
**Não duplique essas regras no prompt** — elas já estão em contexto. Mantenha o arquivo
enxuto: ele custa contexto em toda mensagem.

**O Erick trabalha com duas contas ao mesmo tempo, então o remoto anda enquanto
você trabalha.** Em 01/09 o `origin/main` ganhou 5 commits em pouco mais de uma
hora, todos na loja, enquanto esta sessão mexia na vertical de acesso.

**Why:** commitar sem olhar o remoto mistura trabalho de duas frentes e cria
conflito onde não precisava haver nenhum.

**How to apply:** `git fetch` e `git status -sb` **antes de commitar**, não
depois. Se o remoto andou, veja em que arquivos (`git diff --name-only
HEAD...origin/main`) e escolha uma frente que não encoste na outra conta —
divergir em arquivos diferentes integra limpo; divergir no mesmo arquivo é
conflito manual em produção.

**Desde 01/09/2026 o contexto mora no repo**, em `docs/contexto/` — este arquivo
inclusive. Antes ficava só na memória local do assistente, presa a uma máquina.
Aprendeu algo que vale para a próxima sessão? Edite o arquivo da frente aqui e
commite junto com o código.

O manual da recepção **saiu do artifact e virou tela**: está dentro de
Configurações, no painel da academia (`ManualDaRecepcao.tsx`).

Artifacts antigos, mantidos só como histórico — o que vale está no repo:
- Estado da vertical de acesso: https://claude.ai/code/artifact/f5b0d294-574b-4302-8377-d87edb10282f
- Trabalhando no FitMind (método): https://claude.ai/code/artifact/2dc6be84-d998-4c62-ba86-929d2331d059
- Proposta visual: https://claude.ai/code/artifact/f10c2e6d-2015-4981-aa46-07f82b19924d
- Handoff de 31/08 (Reino + Estação): https://claude.ai/code/artifact/e0fb61f5-ca77-43eb-9f9b-78399af33a01

Ver [[fitmind-vertical-acesso]], [[fitmind-agente-catraca]], [[fitmind-arquitetura-ecossistema]].

## Rodar o app localmente (levantado em 31/08/2026)

`npm run dev` **também** quebra pelo `mcpPlugin()`, não só `vite build`: ele
recusa `routesDir` com barra invertida no Windows. Mesmo remédio — comentar
`plugins: [mcpPlugin()]` no `vite.config.ts`, rodar, e **restaurar depois**.

Feito isso, o SSR ainda dá 500 em **qualquer** rota, porque `routeTree.gen.ts`
importa toda rota de forma ansiosa e quatro pacotes do `package.json` não estão
no `node_modules` local — os mesmos da antiga linha de base de 15. Em 01/09/2026
conferi no registro: os quatro existem e `npm install` os baixa, então num clone
com dependências completas nada disto abaixo deveria ser necessário. Para ver a
tela, criar stubs locais (só em `node_modules`, nunca no repo) com **os nomes
exatos** que o código importa:

- `@lovable.dev/email-js` → `sendLovableEmail`, `parseEmailWebhookPayload`
- `@lovable.dev/webhooks-js` → `WebhookError`, `verifyWebhookRequest`
- `@react-email/render` → `render`
- `@react-email/components` → `Html Head Body Container Section Row Column Text Heading Link Button Hr Img Preview`

**Apagar os stubs no fim**: com eles a linha de base deixa de ser 15 erros e o
próximo turno se perde. E o Vite cacheia o stub — trocar o conteúdo exige matar
o dev e `rm -rf node_modules/.vite`, senão ele repete o erro antigo.

Duas armadilhas de encerramento: o dev sobe em 8081/8082 quando 8080 já está
ocupado por uma instância anterior (matar por linha de comando, `taskkill //IM
vite.exe` deixa sobrar node); e enquanto ele viver ele **reescreve
`routeTree.gen.ts`** — restaurar o arquivo só cola depois que o processo morreu.
O regenerado só reordena imports, não muda rota nenhuma.

O painel da academia exige login, então tela atrás de auth não dá para conferir
assim. O jeito é uma rota descartável em `src/routes/` que monte o componente
sem dados — e apagar depois.
