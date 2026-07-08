# Corrigir gênero "outros" e duplicação no relatório Rede/Downline

## 1) Gênero — remover "Outro"

Estado atual no banco: `female: 4649`, `male: 1701`, `other: 13`.

**Causas dos "other":**
- `src/components/coach/FineshapeImport.tsx` `mapGender()` — quando a coluna Sexo do Fineshape vem em branco ou com prefixo diferente de "masc"/"fem", grava `"other"`.
- `src/components/coach/FitMindShape.tsx` — os selects de gênero (novo cliente linha 1656 e editar cliente ~1886) oferecem a opção `"Outro"`.

**Ações:**
- `FineshapeImport.tsx`: no `mapGender`, quando não identificar prefixo, cair em `"female"` (default do formulário) em vez de `"other"`.
- `FitMindShape.tsx`: remover o `<option value="other">Outro</option>` dos dois selects, mantendo apenas Feminino/Masculino.
- Migração de dados: `UPDATE coach_evaluation_clients SET gender='female' WHERE gender='other'` — 13 registros. Coach pode ajustar caso a caso depois; hoje esses 13 já aparecem como masculino no resultado (após a correção anterior), o que também é chute — padronizar para `female` mantém consistência com o default do form.

## 2) Relatório Rede/Downline — duplicação de vendas

**Causa:** `src/lib/coach-downline.functions.ts` soma receita a partir de duas fontes independentes para os mesmos alunos:
- `transactions` (linhas 111-127)
- `store_orders` (linhas 128-142)

Toda venda feita pela loja gera **um `store_order` + uma transação-espelho** com `metadata.store_order_id`. O `coach-reports.functions.ts` (relatório "Vendas" pessoal) já filtra esses espelhos com `.filter((t) => !t.metadata?.store_order_id)` — por isso o próprio relatório do Erick mostra R$ 359,80 correto e o downline do Nathan mostra R$ 719,60 (exatos 2×).

**Correção em `coach-downline.functions.ts`:**
- Incluir `metadata` no `select` de `transactions`.
- Filtrar `!t.metadata?.store_order_id` antes de somar `txMap`, exatamente como o relatório de Vendas faz.
- Também aumentar o `select` de `commissions` para incluir `metadata` da transação e ignorar mirror ao contabilizar (evita comissão duplicada quando uma venda gera comissão tanto no `transaction` original quanto no espelho).
- (Opcional) Somar também `partner_product_orders` na receita do coach downline, para paridade com o relatório de Vendas — mantenho fora do escopo desta correção; caso a Ana Flávia ainda apareça inflada apenas por isso, aviso.

**Nenhuma migração de dados de comissão** — os valores no banco estão corretos, o problema é só de agregação no relatório.

## Arquivos alterados
- `src/components/coach/FineshapeImport.tsx` (mapGender)
- `src/components/coach/FitMindShape.tsx` (2 selects de gênero)
- `src/lib/coach-downline.functions.ts` (dedupe mirror tx)
- Migração SQL: normalizar 13 registros `other` → `female` em `coach_evaluation_clients`
