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

## Service role com id vindo do navegador (11/09/2026)

`requireSupabaseAuth` só diz **quem** chamou. Se o handler depois consulta com
`supabaseAdmin` usando um id que veio do navegador (`ownerId`, `quadroId`,
`cartaoId`, `partnerId`), a RLS some e qualquer pessoa logada lê o que quiser
trocando o id. Em 11/09 havia quatro assim: `meusQuadrosCrm` (funis de qualquer
dono), `alvosDoFunil` (puxava nome e telefone dos leads do funil de **outra
academia** para a própria campanha — e as duas juntas formavam o caminho
completo), `previaDaAcademia` (contagem de alunos de qualquer academia) e o
`cartaoId` de `enviarMensagemDireta`.

**Why:** função de servidor é rota HTTP mesmo sem tela chamando —
`previaDaAcademia` não tinha chamador e estava aberta do mesmo jeito.

**How to apply:** para **ler**, prefira `context.supabase` (o cliente do próprio
usuário, pela RLS). Quando precisar da service role, confira a pertença do id
antes — `quadroEhDoDono` em `bot-disparos.functions.ts` é o modelo.

**Para provar o que a RLS devolve a um usuário real**, sem login nem token, numa
chamada só do MCP:

```sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<auth.users.id>","role":"authenticated"}', true);
SELECT ... ;   -- auth.uid() passa a devolver o sub
```

A string roda como uma transação implícita, então papel e claims morrem no fim —
conferido: a chamada seguinte volta a `current_user = postgres`. Foi assim que
se provou em 11/09 que o dono do Reino vê o próprio funil e nenhum outro.

## Permissão por área do admin só esconde o menu (14/09/2026)

`admin_permissions` (`canAccess`, em `src/lib/admin-permissions.ts`) filtra os
itens do `AdminShell` e nada mais. As funções de servidor do admin conferem só
`role = 'admin'`: um admin sem a área "Financeiro" não vê o link, mas chama a
função do financeiro direto. Em 14/09 os dois admins eram master ou `full`, então
ninguém estava exposto — **ao criar o primeiro admin limitado, isto passa a valer.**

A aba **Anamneses** (dado de saúde) é a primeira que confere a permissão no
servidor: `exigirPermissao` em `admin-anamneses.functions.ts`, com o mesmo
`canAccess` do menu. É o modelo para as outras.

**Retorno de função de servidor precisa ser serializável no tipo.**
`Record<string, unknown>` quebra o `tsc` (`ValidateSerializable`). Para devolver
uma linha inteira do banco, use o tipo gerado:
`Database["public"]["Tables"]["tabela"]["Row"]`.

**No teste com a chave anônima, 42501 também é sinal de formato certo.** Consulta
que passa por tabela que o anônimo não lê (`profiles`) volta 401/`42501`: é o
Postgres executando, depois de o PostgREST já ter resolvido os joins. Join errado
para antes — 400 `PGRST200` (relação inexistente) ou 300 `PGRST201` (ambígua).
`coaches → profiles` é ambígua (`profile_id` e `approved_by`): use
`profiles!coaches_profile_id_fkey`.
