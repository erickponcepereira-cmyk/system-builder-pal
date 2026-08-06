# Corrigir vendas em que o próprio comprador aparece como vendedor

## O que foi encontrado no banco

Três compras pagas ficaram com o comprador registrado como coach vendedor de si mesmo:

| Pedido | Data | Comprador | Produto | Coach correto |
|---|---|---|---|---|
| PP-82AC2AB7 | 06/08 | Amanda do Nascimento Zanata | Aulão de Jump | Ana Paula Campos Carvalho |
| PP-5C2BFAF8 | 05/08 | Ana Paula Campos Carvalho | Aulão de Jump | Leandro da Silva Amorim |
| PP-7D7F8E13 | 31/07 | Inglidy Braz | AULÃO | Kemilly Victória Gonçalves da Silva |

Outras 25 ocorrências existem, mas estão canceladas (não geraram comissão nem carteira) — serão corrigidas só no cadastro do pedido, sem mexer em dinheiro.

Causa: na compra pela loja, quando o comprador também é coach, o sistema usava o próprio coach dele como vendedor. A correção feita ontem para o caso Edson só entrou hoje às 12h17 (horário de Cuiabá); os pedidos acima são anteriores, e ainda faltam duas brechas (ver abaixo).

## O que será feito

### 1. Correção retroativa (3 pedidos pagos)

Para cada um: trocar o vendedor para o coach real do comprador, recalcular a cadeia de rede (nível 1, 2 e 3 a partir do coach correto), reescrever as comissões já lançadas para os beneficiários corretos e recalcular as carteiras de todos os envolvidos (quem recebeu indevidamente e quem passa a receber). Valores totais da venda, do parceiro e do sistema não mudam — só muda quem recebe a parte de coach/rede.

Também será feita uma varredura geral no banco procurando o mesmo padrão em pedidos de parceiro, de profissional e da loja FitMind, corrigindo todos os pagos encontrados pela mesma regra.

### 2. Fechar as brechas para não acontecer de novo

- Regra única de vendedor: se o comprador e o vendedor forem a mesma pessoa, o vendedor passa a ser o coach vinculado ao comprador; se não houver, sobe para o patrocinador; se não houver nenhum dos dois, a venda fica sem comissão de coach (o valor vai para o sistema) em vez de pagar a própria pessoa.
- Essa regra passa a valer também nas vendas da loja FitMind e na venda feita pelo coach para o aluno, que hoje não usam essa verificação.
- Proteção final no próprio banco: qualquer pedido gravado com comprador igual ao vendedor é corrigido automaticamente na hora da gravação, independentemente da tela ou do caminho usado.
- Na lista de compradores do produto, o coach vendedor exibido passa a refletir o valor corrigido.

## Detalhes técnicos

- Ajustar `resolve_selling_coach` para priorizar `students.coach_id` (quando de perfil diferente) antes do `upline_coach_id`, e retornar `NULL` em vez de cair no próprio coach.
- Passar a chamar a função em `create_store_order` e `create_coach_sale`; hoje só `create_partner_company_order`, `create_partner_product_order` e `create_scheduled_professional_order` usam.
- Novo trigger `BEFORE INSERT/UPDATE` em `partner_product_orders` (e equivalente em `store_orders`) aplicando a mesma regra como rede de segurança.
- Correção retroativa em migração de dados: `UPDATE` de `selling_coach_id` e `upline_l1/l2/l3_coach_id`, reescrita das linhas de `commissions` vinculadas via `partner_order_id`, e `recalc_wallets_for_owner` para cada perfil afetado.

## Fora do escopo

- Nenhuma mudança em preços, percentuais de comissão, estoque ou checkout.
