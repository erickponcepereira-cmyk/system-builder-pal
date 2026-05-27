## Visão geral

Plano dividido em **7 fases** focadas em uma área por vez para facilitar teste e rollback. Itens já resolvidos (sobra de slots indo pro vendedor, fallback de upline vazio e mínimo de 1 ponto por venda) **já estão aplicados na migração anterior** — não repito aqui.

---

### Fase 1 — Carteirinha do aluno (validade + QR condicional)

- **Migration:** adicionar `card_access_days INTEGER` em `products`.
- **Admin → Produtos:** novo campo "Dias de acesso à carteirinha" no editor de produto.
- **`process_paid_transaction`:** ao processar pagamento, gravar `card_valid_until = now() + card_access_days` em `students` (ou nova tabela `student_card_access` se houver múltiplas compras — uso a maior data ativa).
- **Tela da carteirinha (`/student/card`):**
  - QR aparece **somente** se `card_valid_until > now()`.
  - Abaixo do QR: "Válido até DD/MM/AAAA" + dias restantes.
  - Se expirado: mensagem "Carteirinha inativa — adquira um produto para reativar".

---

### Fase 2 — Loja do aluno (bug + comissão)

- **Bug imediato:** `column "kind" of relation "store_order_items" does not exist`. Investigar `store_order_items` e ajustar a função/insert que usa `kind` (provavelmente é `product_kind`).
- Garantir que ao finalizar compra na loja, a `transaction` resultante dispare `process_paid_transaction` normalmente — o coach vinculado ao aluno recebe comissão automaticamente (já está coberto pela função atual; só validar que `student.coach_id` é respeitado).

---

### Fase 3 — Carteira do Admin (sistema)

- **Migration:** criar `admin_system_wallet` (singleton, sem `profile_id`) com `available_balance`, `total_earned`, `total_withdrawn`.
- Slots com `destination = 'admin_wallet'` continuam alimentando a carteira do admin master (compatibilidade), **mas** criar uma view/agregação que mostre o saldo unificado para ambos admins.
- **Admin → nova aba "Carteira do Sistema":** visível para qualquer profile com `role='admin'`, mostra entradas (taxas, slots admin), saídas, saldo. Saque manual com aprovação.

---

### Fase 4 — Nutricionista (medalha + seletor)

- **4a — Bug da medalha:** investigar painel `admin.career.tsx` / patentes e função que atribui badge de nutricionista. Provavelmente falta a regra/UI para marcar um coach como nutricionista. Corrigir e permitir admin atribuir manualmente.
- **4b — Seletor de nutricionista:**
  - Tornar `find_nutritionist_for(coach_id)` mais inteligente: lista candidatos por prioridade (próprio coach se for nutri → indicados diretos → upline → rede ampla).
  - Se houver **mais de 1**, em vez de auto-escolher, gravar entrada `nutritionist_blocked` com `status='awaiting_selection'` e o coach escolhe no painel dele.
  - Se só houver 1, atribui automático (comportamento atual).

---

### Fase 5 — Relatórios completos do Admin

- **Nova rota `/admin/reports`** (ou expandir existente) com detalhamento por venda:
  - Cliente, vendedor, upline 1/2/3, master coach
  - Produto, preço bruto, taxa do MP, impostos, **distribuição completa de cada slot** (quem recebeu, quanto, %), sobra → vendedor, pontos gerados
  - Status: pago / estornado / pendente
- Filtros: período, coach, produto, método de pagamento.
- Export CSV.

---

### Fase 6 — Pedidos físicos vinculados à venda

- Quando uma venda tem slot `product_order_pool`, criar registro em `product_orders` (ou tabela equivalente) vinculado à `transaction_id`.
- **Admin → /admin/product-orders:** listar pedidos pendentes com botão "Dar baixa / Marcar como enviado" + campo de tracking opcional.
- Aluno vê status do pedido na sua área.

---

### Fase 7 — Histórico de pedidos colapsável + Compartilhar FitMindShape

**7a — Histórico (aluno e coach):**
- Substituir tabela longa por **cards colapsáveis** agrupados por pedido.
- Badge de status colorido: Aprovado (verde), Recusado (vermelho), Pendente (amarelo).
- Click expande detalhes; recusados ficam fechados por padrão.

**7b — Compartilhar FitMindShape:**
- A página de compartilhamento (`/resultado/$token`) deve ser **cópia visual idêntica** da página de resultado: avatar, valores de referência, classificação de risco, gráficos — tudo. Hoje está renderizando layout simplificado.
- Botão "Compartilhar":
  - Se `student.phone` existe → abrir `https://wa.me/<telefone>?text=...` direto.
  - Se não → manter fluxo atual (copiar link / share API).

---

### Detalhes técnicos

- Toda mudança em `process_paid_transaction` mantém a estrutura atual (idempotente, deleta e recria por `transaction_id`).
- Migrations seguem padrão: `ALTER TABLE` + GRANT já existentes preservados; novas tabelas com RLS + GRANT explícito.
- Sobre o **ranking**: confirmar que está consumindo `coach_points_log` (pontos de carreira) e não `total_revenue` em `monthly_rankings`. Hoje `refresh_monthly_rankings` já ordena por `total_points`, mas vou auditar a UI do ranking pra garantir que mostra pontos, não R$.

---

### Ordem sugerida de execução

Fases 1, 2 e 3 são as mais impactantes pro usuário final — começo por elas. Fases 4–7 são iterações em cima do que já funciona.

Posso implementar fase por fase, te chamando pra testar entre cada uma. Confirma se a ordem está boa ou quer priorizar diferente?