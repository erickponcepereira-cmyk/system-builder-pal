## Escopo

Duas mudanças, ambas com pegada larga. Antes de codar, alinhar para não quebrar vendas existentes.

---

### Parte A — Link de indicação por produto

**Fluxo**: aluno copia `/r/{seuCódigo}?p={produtoId}` da carteirinha ou da loja. Quem clica:
- cai em `r.$code.tsx` que valida o código (já existe) e agora também guarda `productId`;
- se logado, redireciona direto para a página do produto;
- se anônimo, segue para `/register` (já herda o coach do indicador) e, após login, é jogado em `/loja/{produtoId}` (ou `/loja#p=…`) com o produto pronto pra comprar e a indicação carimbada no carrinho.

**Carimbo da indicação na venda** (essencial pra parte B funcionar):
- estender `create_store_order` para aceitar `_referrer_student_id uuid DEFAULT NULL` e gravar em `store_orders.referrer_student_id`;
- estender a chamada cliente (StorePage / cart) para enviar o `referrerStudentId` quando houver indicação ativa em sessionStorage;
- atualizar `applyApproval` (webhook MP) para copiar `store_orders.referrer_student_id → transactions.referrer_student_id` no momento em que marca paid.

**Botão "Copiar link"**:
- aparece só em produtos com algum slot `applies_to_student_referral=true`;
- componente em StorePage (card de produto) e na carteirinha do aluno (lista compacta);
- usa o `referral_code` do próprio aluno (já existe em `students.referral_code`).

**Arquivos**:
| Arquivo | Mudança |
|---|---|
| `src/routes/r.$code.tsx` | lê `?p=`, salva em sessionStorage; se já logado, redireciona direto pro produto |
| `src/components/auth/StudentRegistration.tsx` | após sucesso, se `pendingProductId` existir, redireciona pra `/loja?p=…` no fluxo de login subsequente |
| `src/components/student/StorePage.tsx` | botão "Copiar link de indicação" nos cards elegíveis; ao criar pedido, envia `referrerStudentId` se aplicável |
| `src/lib/store-orders.functions.ts` (ou onde `create_store_order` é chamado) | passar `_referrer_student_id` |
| Migração SQL | `create_store_order` aceita novo arg; `applyApproval` propaga referrer |

---

### Parte B — Motor de comissões (PostgreSQL)

O motor de verdade é `process_paid_transaction` (RPC PG, ~250 linhas), disparada por trigger `on_transaction_paid`. Hoje ela:
- itera **todos** slots ativos do produto;
- não distingue venda normal vs indicação;
- não popula `commissions.is_referral` nem `commissions.referred_by_student_id`.

**Reescrita**:
1. Detecta venda por indicação: `tx.referrer_student_id IS NOT NULL`.
2. Seleciona slots conforme o modo:
   - venda normal → `applies_to_referral_sales = true`
   - venda por indicação → `applies_to_student_referral = true`
   - fallback (compat): se nenhum slot estiver marcado, usa todos (comportamento atual). Evita zerar comissões em produtos antigos.
3. Novo destino `referral_student`: beneficiário = `profile_id` do `students.referrer_student_id`.
4. Em toda comissão emitida quando referral: `is_referral=true`, `referred_by_student_id = tx.referrer_student_id`.
5. Mantém remainder, pontos, ranking, carteirinha, professional assignment intactos.

**Arquivos**:
| Arquivo | Mudança |
|---|---|
| Migração SQL | `CREATE OR REPLACE FUNCTION public.process_paid_transaction(...)` reescrita com as 5 regras acima |
| `src/lib/financialEngine.ts` (TS) | `calculateReferralDistribution` já lê `applies_to_student_referral` ✓ — sem mudança |

---

### Ordem de execução

1. Migração SQL única: `create_store_order` (novo arg) + `process_paid_transaction` (reescrita).
2. Frontend: rota `r.$code` aceita `?p=`, StorePage envia `referrerStudentId`, botão de copiar link.
3. `applyApproval` (TS) propaga `referrer_student_id` store_order → transaction antes de marcar paid.
4. Smoke test: gerar link de indicação, simular compra com outro aluno, conferir que as comissões saem com `is_referral=true` e beneficiário correto.

---

### Riscos

- **Compat slots existentes**: produtos antigos podem não ter `applies_to_referral_sales` marcado. O fallback "se nenhum marcado, usa todos" mantém o comportamento atual em vendas normais.
- **Vendas em aberto**: vendas pending criadas antes da migração entram com `referrer_student_id=null` e seguem o caminho normal. Sem migração de dados retroativa.
- **`process_paid_transaction` é grande**: vou reescrever preservando tudo (subscriptions, digital_purchases, ranking, pontos, partner assignment, carteirinha) e mudando só o bloco de slots + commissions.

---

### Confirmar antes de executar

- (a) OK no fallback "sem slot marcado = usa todos os slots ativos"? Alternativa: bloquear venda se produto não tiver slot do tipo correto. Mais seguro, quebra produtos antigos.
- (b) Link copiado deve ser `/r/{código}?p={produtoId}` ou `/r/{código}/p/{produtoId}` (rota separada)? Query é simples; rota separada exige novo file. Vou de query.
- (c) Pra simplificar o redirect pós-cadastro, posso usar `sessionStorage.fitmind_pending_product` lido no login subsequente do aluno. OK?
