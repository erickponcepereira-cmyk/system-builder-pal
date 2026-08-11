# Vendas do AULÃO (Julia / Team Dunamis) — diagnóstico e correção

## O que os dados mostram

Consultei o banco. O produto "AULÃO" (parceiro Team Dunamis, da Julia) tem **uma única venda registrada desde sempre**:

- Pedido `PP-7D7F8E13`, pago em 31/07/2026, R$ 20,00
- Cliente: **Inglidy Braz**
- Vendedora (coach): Kemilly Victória
- Líquido do parceiro: R$ 15,91 — já creditado em `partner_wallets` (saldo disponível R$ 15,91)
- Comissões da venda e da rede (níveis 1, 2 e 3) existem e estão como "disponível"

Ou seja: **nenhum valor foi perdido**. Os problemas são de exibição.

## Causas confirmadas

1. **Cliente aparece como "—" no painel do parceiro**
   A aba de carteira do parceiro busca o nome do comprador direto do navegador (`students` → `profiles`). As regras de acesso do banco não permitem que um parceiro leia o cadastro de um aluno que não é da rede dele, então o nome volta vazio e a tela mostra "—".

2. **Nada aparece na carteira/relatório do painel de Coach da Julia**
   A carteira e os relatórios de coach nunca leem `partner_wallets` nem as vendas de produtos de parceiro. Como o ganho da Julia está na carteira de parceiro, o painel de coach mostra R$ 0,00.

3. **Relatório do parceiro não lista vendas**
   O relatório do parceiro traz visitas, cupons e gratuidades, mas **não tem uma lista de pedidos com cliente, produto, valor e data**. Só existe um total agregado.

4. **Fitcoin do aluno**
   Fitcoin só é gerado por comissão de indicação. Este pedido não teve aluno indicador (`referred_by_student_id` vazio, `referral_fitcoin_amount` = 0), então não havia fitcoin a creditar. Se a expectativa é que toda compra gere fitcoin para quem indicou, isso é uma regra nova, não um bug.

## O que será feito

### 1. Nome do cliente no painel do parceiro
Criar uma função de servidor `listMyPartnerSales` que:
- resolve o parceiro do usuário logado
- carrega apenas os pedidos daquele parceiro
- resolve nome/foto do comprador, nome do produto e nome da coach vendedora com acesso privilegiado no servidor (sem expor dados de terceiros além de nome do comprador e da vendedora do próprio pedido)

`PartnerWalletTab` passa a consumir essa função em vez de montar os nomes no navegador.

### 2. Relatório do parceiro com lista de vendas
Adicionar ao relatório do parceiro um bloco "Vendas do período" com: data, pedido, cliente, produto, forma de pagamento, valor bruto e líquido do parceiro, status e situação de liberação. Mesma resolução de nomes no servidor.

### 3. Painel de Coach mostrar os ganhos como parceiro/profissional
Na carteira e nos relatórios de coach, quando o usuário também for parceiro ou profissional aprovado, exibir um cartão adicional "Ganhos como parceiro/profissional" com saldo disponível, pendente e total, além das vendas correspondentes — deixando claro de qual origem vem cada valor, sem somar duas vezes.

### 4. Situação de liberação do pedido
O pedido está com `release_status = pending` e `available_at` vazio, embora as comissões já tenham sido liberadas. Vou corrigir a marcação de liberação desse pedido e dos demais no mesmo estado, para que os relatórios mostrem "liberado" de forma coerente com o que já foi pago nas carteiras.

## Detalhes técnicos

- Nova função em `src/lib/partner-sales.functions.ts` usando `requireSupabaseAuth` + cliente admin dentro do handler, com filtro obrigatório pelo `partner_id` do próprio usuário.
- `src/components/partner/PartnerWalletTab.tsx`: troca das consultas diretas por `useServerFn` + `useQuery`.
- `src/lib/partner-reports.functions.ts`: novo campo `recent_sales` no retorno + render na aba de relatórios do parceiro.
- `src/components/coach/tabs/WalletTab.tsx` e relatórios de coach: leitura adicional de `partner_wallets` / `professional_wallets` do próprio perfil.
- Correção pontual de `release_status`/`available_at` dos pedidos já quitados (script de dados, sem alteração de schema).
