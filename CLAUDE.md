# FitMind — instruções do repositório

App do FitMind Club: Vite + React + TypeScript + TanStack Router + Capacitor + Supabase.
~700 arquivos em `src/`, ~660 migrations. Branch de trabalho: `main`.
O Lovable sincroniza deste repo — o que entra no `git push` vai para produção.

---

## 1. Verificação — obrigatória antes de entregar

```
node node_modules/typescript/bin/tsc --noEmit
```

- **Não use `npx tsc`**: baixa um pacote decoy e não funciona.
- Não existe script `typecheck` no `package.json`. É o binário direto, acima.
- **Linha de base: 0 erros**, com o `node_modules` completo (verificado em
  01/09/2026: tsc 5.9.3, 2067 arquivos no programa, 659 de `src/`).
  **Qualquer** erro é regressão sua — conserte antes de entregar.
- **Se aparecerem 15 erros** `TS2307`/`TS18046` em `src/lib/email-templates/*`,
  `src/routes/lovable/email/*` e `src/lib/__tests__/*`, o defeito é o seu
  `node_modules`, não o repo: quatro pacotes do `package.json` não foram baixados.
  Os quatro **existem no registro público** e `npm install` os traz. Era isso que
  produzia a antiga "linha de base de 15" anotada em 28/08/2026 — não uma
  característica do projeto. Rode `npm install` em vez de contornar.
- "Deve funcionar" não é verificação. Rode, mostre a saída. Se falhar, diga que falhou
  e mostre o erro — nunca relate sucesso sem evidência.

---

## 2. Padrões de código

**Nomes**

| Elemento | Convenção |
|---|---|
| Variáveis | Revelam intenção: `userCount`, não `n` |
| Funções | Verbo + substantivo: `getUserById()`, não `user()` |
| Booleanos | Forma de pergunta: `isActive`, `hasPermission`, `canEdit` |
| Constantes | `SCREAMING_SNAKE`: `MAX_RETRY_COUNT` |

Se precisa de comentário para explicar um nome, renomeie.

**Funções**: máx. 20 linhas (ideal 5–10); uma responsabilidade; um nível de abstração;
máx. 3 argumentos; não mutar entradas.

**Estrutura**: guard clauses com retorno cedo; máx. 2 níveis de aninhamento;
composição de funções pequenas; código junto de quem usa.

**Não faça**: comentar o óbvio · helper para one-liner · factory para 2 objetos ·
`utils.ts` com uma função · números mágicos · funções-deus · abstração "para o futuro"
que ninguém pediu.

**Escreva o código, não a aula.** Pedido de feature → escreva. Bug relatado → conserte.
Requisito ambíguo → pergunte, não presuma.

---

## 3. Antes de editar qualquer arquivo

1. **Quem importa este arquivo?** Pode quebrar.
2. **O que este arquivo importa?** Mudança de interface.
3. **Que testes cobrem isto?** Podem falhar.
4. **É componente compartilhado?** Vários lugares afetados.

Edite o arquivo **e todos os dependentes na mesma tarefa**. Nunca deixe import quebrado.

**Contexto que o código não conta** — decisões, o porquê delas, e armadilhas que já
custaram tempo — está em [`docs/contexto/`](docs/contexto/MEMORY.md), um arquivo por
frente. Leia o da frente em que for mexer, não todos. Ao aprender algo que valeria para
a próxima sessão, **edite o arquivo da frente e commite junto com o código**.

**Antes de criar um módulo, audite o que já existe.** O banco já tem ~200 tabelas,
incluindo assinatura (`subscriptions`, `subscription_invoices`, `recurring_charges`),
financeiro (`transactions`, `wallets`, `commissions`, `mercadopago_payments`),
CRM (`crm_quadros`/`crm_cartoes`), bot (`bot_fluxos`/`bot_disparos`),
`bioimpedance_evaluations`, `attendance_logs`, `student_checkin_scans`.
**O risco real deste projeto é duplicação, não falta de base.**

---

## 4. Armadilhas do ambiente

- **Fim de linha é misto no repo** — há LF e CRLF convivendo, inclusive dentro da mesma
  pasta (`src/lib/`, `docs/`). `core.autocrlf=true`. Antes de qualquer substituição
  multi-linha por script, **confira o arquivo alvo** (`file <arquivo>`) e case o padrão
  dele; assumir CRLF falha silenciosamente nos arquivos LF, e vice-versa.
- **`vite build` só roda comentando `mcpPlugin()` no `vite.config.ts`** (bug de caminho
  no Windows). Restaure depois e **nunca commite o arquivo alterado**. Só é preciso para
  regenerar `routeTree.gen.ts` — e não rode `git checkout` nesse arquivo depois do build,
  senão reverte o que acabou de gerar.
- **`npm run dev` quebra pelo mesmo `mcpPlugin()`**, e mesmo comentando ele o SSR dá 500
  em **qualquer** rota: `routeTree.gen.ts` importa tudo de forma ansiosa, e quatro pacotes
  do `package.json` faltam no `node_modules` — os mesmos da antiga linha de base de 15.
  **Um `npm install` completo traz os quatro** (conferido em 01/09/2026), o que
  provavelmente dispensa os stubs abaixo; isso não foi testado com o dev de pé.
  Para ver tela, crie stubs locais de `@lovable.dev/email-js`, `@lovable.dev/webhooks-js`,
  `@react-email/render` e `@react-email/components`, **e apague no fim**: com eles a linha
  de base deixa de ser 15 e o próximo turno se perde. O Vite cacheia o stub — trocar o
  conteúdo exige matar o dev e `rm -rf node_modules/.vite`. Enquanto o dev viver ele
  reescreve `routeTree.gen.ts`; restaurar o arquivo só cola depois de matar o processo.
- **Tela atrás de login não dá para conferir assim.** O jeito é uma rota descartável em
  `src/routes/` que monte o componente sem dados — e apagar depois.
- **O Supabase do MCP não é o do app.** O app é `myqyjifvrlwvesrwubsg`. Para inspecionar
  produção, use a API REST com a chave anônima do `.env`: coluna inexistente → 400,
  tabela inexistente → 404 `PGRST205`, sem permissão → 401/`42501`.

---

## 5. Banco e RLS

- SQL vai pelo MCP do Lovable. **Não peça para rodar SQL no console do Supabase** — não
  há acesso a ele.
- Depois de aplicar SQL, confira `md5(prosrc)` contra o corpo no arquivo da migration.
  Já divergiu em três de três nas primeiras vezes.
- **Toda policy precisa de `TO` explícito.** Sem ele o Postgres aplica a `PUBLIC`,
  incluindo `anon`.
- **Nunca consulte `profiles` de dentro de uma policy** — use `is_admin()`.
  Um revoke em `partners` derrubou o login de todos os parceiros em 22/08/2026.

---

## 6. Antes de dizer "pronto"

- [ ] Fiz exatamente o que foi pedido?
- [ ] Editei todos os arquivos necessários, incluindo dependentes?
- [ ] **Rodei** o código — não só li?
- [ ] `tsc --noEmit` limpo, zero erros?
- [ ] Algum caso de borda ficou de fora?

Se qualquer item falhar, conserte antes de entregar. Se algo ficou por fazer,
diga o que ficou e por quê.
