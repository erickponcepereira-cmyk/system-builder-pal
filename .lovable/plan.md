# Correções: coach de si mesmo, pendentes vencidos e lista de compradores

## 1. Caso Edson Silva (venda com coach errado)

O que os dados mostram:

- Pedido `5be8ff73…` (Aulão de Jump, R$ 25,00, pago em 06/08 09:49) está com coach vendedor = o próprio Edson (registro de coach dele).
- O cadastro de aluno do Edson foi criado 1 minuto antes da compra e hoje está corretamente vinculado ao coach Fernando.
- As comissões dessa venda já foram geradas com Edson como vendedor (R$ 2,08) e Fernando apenas como Upline 1 (R$ 0,07).

Causa: o pedido copia o coach do cadastro de aluno no momento da compra. Como o Edson é coach e o aluno dele mesmo tinha ficado apontando para o próprio registro de coach, a venda saiu "vendida por ele mesmo".

Correções:

- Regra nova: ninguém pode ser o próprio coach vendedor. Se o coach do aluno for o próprio comprador (mesma pessoa), a venda passa a ser atribuída ao coach acima dele (no caso, Fernando).
- Mesma trava no cadastro: um aluno nunca fica com coach igual a ele mesmo; cai automaticamente para o patrocinador.
- Correção retroativa desta venda: coach vendedor passa a ser Fernando, as comissões dela são apagadas e recalculadas na estrutura correta (Fernando como vendedor, os uplines dele nos níveis 1/2/3), e as carteiras envolvidas são reconciliadas.
- Varredura: identificar e corrigir outras vendas na mesma situação (comprador = coach vendedor da mesma pessoa) e refazer suas comissões.

## 2. Pendentes com mais de 30 minutos viram recusadas

Hoje só existe expiração automática para agendamentos de profissionais. Vamos estender:

- Pedidos de produto (parceiro e profissional) em "pendente" há mais de 30 minutos passam para "cancelada/recusada", liberando a vaga.
- Exceção: pedidos com pagamento em análise no gateway (`in_process`) não são cancelados enquanto aguardam retorno.
- Roda a cada 5 minutos, junto da rotina automática que já existe.
- Limpeza única dos pendentes antigos que já passaram desse prazo (ex.: os pendentes de 06/08 de madrugada no Aulão de Jump).

## 3. Lista de compradores (modal "Compradores")

- "Vagas restantes" passa a mostrar o número real: estoque total menos vendas pagas menos pendentes ainda dentro da janela de reserva.
- Os três números do topo (Pagas, Pendentes, Vagas) viram filtros clicáveis, com as abas: Todos, Pagas, Pendentes e Canceladas.
- A lista passa a incluir também as vendas canceladas/recusadas (hoje elas são omitidas), com etiqueta própria.
- O contador de cada aba reflete o total real daquele status.

## Detalhes técnicos

- Migração:
  - Ajuste em `create_partner_product_order` (e na variante de produto de parceiro) para nunca usar como `selling_coach_id` o coach que pertence ao mesmo perfil do comprador — usa `upline_coach_id`.
  - Ajuste em `ensure_self_student_for_coach` / sincronização de `students.coach_id` para nunca gravar auto-vínculo.
  - Nova função `expire_unpaid_product_orders()` (30 min, ignora `in_process`) + `cron.schedule` a cada 5 minutos; reaproveita a lógica de liberação de slot de `expire_unpaid_professional_appointments`.
  - Script de correção retroativa do pedido `5be8ff73…`: `UPDATE partner_product_orders SET selling_coach_id = <Fernando>`, `DELETE` das 4 linhas de `commissions` do pedido, regeração via a rotina de split existente e `recalc_wallets_for_owner` nos beneficiários afetados.
- `src/lib/product-buyers.server.ts`: remover o `.neq('status','cancelled')`, retornar `stock`, `paidCount`, `pendingCount`, `cancelledCount` e `remaining` calculado com `partner_product_used_slots`.
- `src/components/products/ProductBuyersModal.tsx`: cards do topo viram botões de filtro (estado `filter`), nova aba "Canceladas", badge de status por cor.
