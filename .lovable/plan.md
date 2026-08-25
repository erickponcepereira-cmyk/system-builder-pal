# O "Criador" fantasma do Jorge em Pagamentos

## O que está acontecendo (verificado no banco)

O Jorge **não é dono** de nenhum produto:

- "Mulheres Essenciais" é da Loureane; "Condomínio Chapada do Poente" é do Adriano.
- Nenhum pedido tem o Jorge como criador (`professional_coach_id` dele: 0 pedidos).
- O Jorge não tem cadastro de parceiro.

O que ele tem são comissões pequenas de rede nesses pedidos (R$ 0,40 e R$ 0,18).

A causa é uma comparação errada na tela de Pagamentos: para decidir "esta pessoa é a criadora do produto", o código compara o parceiro do pedido com o parceiro da pessoa. Como o Jorge **não tem parceiro** (vazio) e os pedidos de produto de profissional também têm o campo de parceiro **vazio**, "vazio = vazio" dá verdadeiro — e a tela passa a exibir o **líquido inteiro do criador** (R$ 118,57 e R$ 8,84) como se fosse ganho dele.

É só na exibição do admin. O cálculo oficial de saldo do banco (`wallet_statement`, `saldo_disponivel`) e o adiantamento (`admin_advance_creator_release`) usam a comparação correta, com proteção para valores vazios.

## Se algo foi pago errado

Os dois saques do Jorge (R$ 128,06 e R$ 59,00) foram pagos em **julho**, antes desses pedidos de agosto — então esse furo não gerou pagamento indevido para ele. Mesmo assim, a correção inclui uma conferência de todas as pessoas afetadas contra o que já foi pago.

## Outras carteiras com o mesmo problema

Levantamento feito no banco — pedidos pagos exibidos como "produto criado" para quem não é o criador:

| Pessoa | Pedidos indevidos | Valor exibido a mais |
|---|---|---|
| Jorge Ramos de Oliveira | 8 | R$ 509,64 |
| Loureane Barce da Silva | 4 | R$ 474,28 |
| Carol Heming | 12 | R$ 474,18 |
| Adriano Luiz de Albuquerque Nunes | 4 | R$ 35,36 |
| rita de cassia vicentini utuari | 4 | R$ 35,36 |
| Kátia da Conceição Costa | 1 | R$ 8,84 |

## Correção

1. Corrigir a regra de "é o criador?" na tela de Pagamentos para exigir que a pessoa realmente tenha o cadastro correspondente — nunca tratar "vazio = vazio" como igualdade. Isso vale nas três aberturas do mesmo teste: aba Vendas, aba Comissões ("Produto criado") e os totais do cabeçalho do modal.
2. Refazer a conferência das 6 pessoas depois da correção, comparando o que a tela mostra com o extrato oficial do banco.
3. Rodar a auditoria de carteiras já existente e confirmar que nenhum saque pago ficou acima do liberado real (nenhum adiantamento em aberto criado por esse furo).

## Como conferir

Abrir o Jorge em Pagamentos: a aba Comissões deve mostrar apenas as comissões de rede dele (centavos), sem nenhuma linha "PRODUTO CRIADO", e o "Total ganho" do cabeçalho deve bater com o extrato do painel dele. Repetir com Carol Heming e Loureane (essa última é criadora de verdade em parte dos pedidos — devem sobrar só os pedidos dela).

## Detalhes técnicos

- `src/lib/admin-payouts.functions.ts`: em `ppoSales` (`isCreator`), em `productEarnings` (filtro do bloco 1) e em `myCoprodDeduction`, trocar `o.partner_id === partnerId || o.professional_coach_id === coachId` por comparações que exijam `partnerId != null` / `coachId != null`.
- Conferir o mesmo padrão nos agregados do dashboard (`creatorAggDash`, `creatorAgg`) e em `admin-financial.functions.ts` antes de fechar.
- Nenhuma migration necessária: as funções do banco (`wallet_statement`, `saldo_disponivel`, `admin_advance_creator_release`) já filtram corretamente.
