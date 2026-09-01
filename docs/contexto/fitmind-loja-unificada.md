---
name: fitmind-loja-unificada
description: Loja nova e área de membros do FitMind — onde está o documento de estado e as armadilhas do ambiente local
metadata: 
  node_type: memory
  type: project
  originSessionId: 25939389-b61d-445f-8d11-f56d213f0b85
  modified: 2026-08-28T03:25:31.720Z
---

Trabalho de unificação da loja e construção da área de membros do FitMind Club,
iniciado em 11/08/2026 e ativo em 22/08/2026.

**LEIA PRIMEIRO:** `C:\dev\fitmind-bugs\docs\ESTADO-LOJA-E-CURSOS.md`
(atualizado em 23/08/2026, commit 4a64fc4c). Ele tem tudo: o que foi
construído, o que já está aplicado no banco, as descobertas que custaram
investigação, os erros cometidos no caminho, o que falta e as decisões já
tomadas. Não redescubra o que está lá.

Em 23/08 a loja nova **passou a vender**: carrinho (`store-cart.ts`) e checkout
do aluno (`store-checkout.ts`). Continua atrás do gate de master admin, mas
cria pedido e cobra de verdade — não é mais tela de leitura. Próximo passo é o
modo coach (seletor de aluno + `create_coach_sale`).

Repositório: `C:\dev\fitmind-bugs`, branch `main`. Existe outra cópia em
`C:\dev\fitmind` (`feat/mobile-shell`) que **não** é a usada.

**Armadilhas do ambiente local, que não estão no repo:**

- Verificação válida é `node node_modules/typescript/bin/tsc --noEmit`.
  `npx tsc` baixa um pacote decoy e não funciona.
- Linha de base: **15 erros pré-existentes** em `email-templates`,
  `routes/lovable/email` e `vitest` — pacotes declarados no `package.json` mas
  ausentes do `node_modules` desta máquina. Não são bugs. Erro fora desses
  arquivos é regressão sua.
- `vite build` só roda comentando `mcpPlugin()` no `vite.config.ts` (bug de
  caminho no Windows). Restaure depois e nunca commite alterado. Só é preciso
  para regenerar `routeTree.gen.ts` — e não rode `git checkout` nesse arquivo
  depois do build, senão reverte o que acabou de gerar.
- Fim de linha é **misto**, não CRLF uniforme — verificado em 28/08/2026: há LF e CRLF
  convivendo dentro da mesma pasta (`src/lib/activation-order.functions.ts` é CRLF,
  `src/lib/academia-teste.functions.ts` é LF; em `docs/`, dois de cada). `core.autocrlf=true`.
  Antes de substituição multi-linha por script, cheque o alvo com `file` e case o padrão dele.
- O Supabase do MCP (`ygixwjukmpdsnoilanoc`) **não é** o do app
  (`myqyjifvrlwvesrwubsg`). Para inspecionar produção use a API REST com a chave
  anônima do `.env`: coluna inexistente dá 400, tabela inexistente dá 404
  PGRST205, sem permissão dá 401/42501.

**Regra de RLS aprendida na dor:** toda policy precisa de `TO` explícito (sem
ele o Postgres aplica a PUBLIC, incluindo anon) e nunca consulte `profiles` de
dentro de uma policy — use `is_admin()`. Um revoke em `partners` derrubou o
login de todos os parceiros em 22/08.

Modelos visuais aprovados:
- loja: https://claude.ai/code/artifact/c55fbe59-b40d-4637-b8d7-683c86e4b2e3
- área de membros: https://claude.ai/code/artifact/046aa301-029f-4bf7-9339-db461898a556
