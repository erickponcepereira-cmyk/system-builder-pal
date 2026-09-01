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
- **Linha de base: 15 erros pré-existentes** (verificada em 28/08/2026), todos
  `TS2307`/`TS18046` em três lugares:
  `src/lib/email-templates/*`, `src/routes/lovable/email/*`, `src/lib/__tests__/*` (vitest).
  São pacotes declarados no `package.json` mas ausentes do `node_modules` local —
  **não são bugs do repo**. Erro fora desses três caminhos é regressão sua: conserte
  antes de entregar.
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
- [ ] `tsc --noEmit` nos 15 erros da linha de base, sem regressão?
- [ ] Algum caso de borda ficou de fora?

Se qualquer item falhar, conserte antes de entregar. Se algo ficou por fazer,
diga o que ficou e por quê.
