# FitMind — fonte financeira única

## Regra permanente

`financial_ledger_events(profile_id)` é a fonte canônica de comissões, ganhos de produtos próprios e créditos de co-produção. `wallet_statement` consolida esse ledger com saques, pagamentos por carteira e adiantamentos. O painel administrativo de Contas a Pagar deve consumir `admin_payables_report`; não deve reconstruir os totais lendo tabelas de carteiras separadamente.

## Identidade financeira

- Resolver sempre todos os registros de parceiro e profissional ligados ao `profile_id`.
- Nunca usar `LIMIT 1`, `maybeSingle()` ou apenas o primeiro cadastro para calcular saldo.
- Deduplicar eventos por origem financeira; não somar novamente o mesmo pedido porque ele aparece nos papéis de criador, vendedor e co-produtor.
- Carteiras materializadas são cache para compatibilidade. Em caso de divergência, prevalece `wallet_statement`.

## Estados

- `available`: liberado após carência e regras financeiras.
- `hold`: ainda em carência.
- `network_blocked`: comissão de rede sem missão concluída; não entra no disponível.
- Fitcoin permanece separado do dinheiro sacável.
- Saques abertos, pagamentos internos e adiantamentos reduzem o disponível consolidado apenas uma vez.

## Forma de pagamento

- A forma de pagamento canônica é a do pagamento **aprovado** no gateway (`mercadopago_payments.payment_method`), nunca a escolhida antes do checkout.
- `store_orders.payment_method` / `partner_product_orders.payment_method` são sincronizados por gatilho (`sync_source_payment_method_from_mp`) assim que o pagamento fica `approved`, antes do processamento financeiro.
- A taxa da maquininha (Pix ~0,99% x cartão ~4,98%) sai desse campo; se ele mentir, todo o líquido e todas as comissões saem inflados. O carrinho não pergunta mais a forma de pagamento por causa disso.
- Bug histórico: 02/09/2026, pedido FM-D77E7F0E (R$ 1.280,00) pago no cartão e processado como Pix. Reprocessado; 15 pedidos anteriores tiveram apenas o registro do método corrigido.

## Segurança e operação

- As funções canônicas são internas e executáveis apenas por `service_role`; telas chamam funções de servidor autenticadas.
- Mudanças em comissões, pedidos e co-produções precisam terminar em recálculo idempotente do perfil afetado.
- Após qualquer alteração estrutural, comparar painel, extrato consolidado e carteiras materializadas, além de conferir múltiplos IDs para o mesmo perfil.

## Data da venda nos relatórios

- A data canônica de uma venda da loja é `store_orders.paid_at` (com `created_at` como último recurso). **Nunca use `updated_at`**: qualquer correção administrativa no pedido reescreve esse campo e joga a venda para o dia da correção.
- Bug histórico: 02/09/2026, o backfill de forma de pagamento tocou 16 pedidos e a adesão da Katyerly (FM-8298F056, paga em 31/08) passou a aparecer como venda de 02/09 no relatório da coach Suellyn. Carteira, comissões e pontos estavam corretos — só a data do relatório mentia.
- `paid_at` foi backfilled em todos os 177 pedidos pagos e agora é preenchido automaticamente pelo gatilho `trg_set_store_order_paid_at`.

## Por que o painel de pagamentos "quebrava toda semana" (12/09/2026)

Não era o painel. Eram duas coisas que reescreviam o passado sozinhas.

**1. O reprocessamento apagava a data do pedido.** `admin_reprocess_partner_order`
zerava `paid_at` para driblar a guarda de idempotência de
`process_partner_product_order_paid` (`IF o.paid_at IS NOT NULL THEN RETURN`). Só que
essa função abre com `v_paid_at := COALESCE(o.paid_at, now())` e fecha com
`SET paid_at = v_paid_at`. Com o campo zerado, **todo reprocessamento carimbava o
pedido com a data de hoje**: comissão liberada voltava para `now() + 7 dias`, o pedido
migrava de mês nos relatórios e o `created_at` das comissões virava hoje. Corrigido —
a função agora guarda `paid_at` e o `available_at` original antes de apagar as comissões
e restaura os dois depois. **Nunca zere `paid_at` sem restaurar.**

**2. A carteira é materializada, mas a verdade depende do relógio.** `wallets` é uma
tabela; `financial_ledger_events` é a fonte e decide `hold` vs `available` por
`available_at <= now()`. Quando o prazo vence não acontece evento nenhum — ninguém
avisa a carteira. Resultado: algumas carteiras passam a discordar do extrato **sozinhas,
sem ninguém ter feito nada**. Em uma sessão, 4 divergiram em poucos minutos.
`public.auditar_carteiras(_corrigir)` é o lugar para ver e consertar: sem argumento é
diagnóstico, com `true` recalcula as divergentes a partir do ledger. Rode antes de pagar.

**A carteira coerente pode estar certa e ainda assim enganar.** O caso da Vimark:
`total_earned − total_withdrawn = available + pending` fechava, mas o saldo estava todo
em `pending`. O motivo era legítimo — R$ 114 em `network_blocked`, que é comissão de rede
esperando `network_unlock_history` confirmar a meta do mês. Some a isso que ela é
**parceira**: os R$ 2.760 de saques pagos cobrem `wallets` (coach) **e**
`partner_wallets`, que são carteiras diferentes. Conferir uma só dá diferença garantida.

**`recalc_wallets_for_owner` rateia os saques entre as três carteiras** (`wallets`,
`partner_wallets`, `professional_wallets`) por uma razão `v_ratio`, em vez de atribuir
cada saque à sua origem. Por isso `total_withdrawn` de uma carteira não é a soma dos
saques dela — é uma fração. Não é bug de dados (o total fecha), mas torna a leitura por
carteira enganosa.

## Carreira do coach: três contas para a mesma coisa

O painel tinha **três definições de "venda própria"**, e por isso três números na mesma
tela: medalhas somavam o que o coach vendeu (`selling_coach_id`); patentes somavam isso
**mais produto criado** (`professional_coach_id`, `partner_id`); o ranking da rede somava
por **aluno** — se o coach A vendia para o aluno do coach B, o ranking premiava B e a
medalha premiava A. Hoje os três leem `coach_vp_no_periodo` / `coach_ve_no_periodo`.
**Produto criado não entra em VP** — contar premiava quem só cadastrou. Três pessoas
tinham 100%, 94% e 76% do VP vindo de produto que criaram.

**`max_team_sales_pct` é TETO, não piso.** Soma 100 com `min_own_sales_pct` em todas as
linhas, e `required_revenue` é a produção da janela ("R$ 20.000 em 6 meses"). O código
exigia `team >= required * ve%`, tratando o teto como mínimo — quem vendia tudo sozinho
não subia, o contrário do que a regra protege.

**Cuidado com a janela ao conferir uma patente:** níveis 1–5 usam 1 mês, 6–8 usam 6
meses, 9+ usam 12. Conferir um nível baixo com a janela de 12 meses dá conclusão errada.

`refresh_coach_patents` estava morta desde a reforma do plano: lia `pr.patent`,
`min_direct_students` e `min_monthly_revenue`, que só têm valor nas **7 linhas inativas**
de `patent_rules`; não filtrava `is_active`; e gravava em `profiles.patent`, vazia na base
inteira. Reescrita, com `refresh_coach_medals` ao lado — antes a conquista só era gravada
se o coach **abrisse a tela**, e era por isso que havia 91 coaches com patente e só 7 com
medalha.

## Bônus de Master Coach — o que é, e o buraco nele (15/09/2026)

Quando alguém **marcado como Master Coach opera uma venda para o aluno de outro
coach**, uma fatia da comissão do coach titular vai para ele. A fatia sai de
dentro do líquido do titular, depois da rede — o cliente não paga nada a mais e
o dono do produto não perde nada; quem divide é o coach.

O percentual é `coaches.master_coach_commission_pct` **do coach titular do
aluno**, não do master, limitado entre 10% e 70%. Hoje: 100 coaches em 10%, e
seis com 20/30/40/50/70.

**Quem conta como Master Coach é mais largo do que o nome sugere.**
`is_master_coach()` devolve verdadeiro para quem tem a badge `master_coach`
**ou** para qualquer coach com `is_professional = true` e aprovado. Ou seja:
todo profissional aprovado é master coach por tabela, sem ninguém ter concedido.

**O buraco:** a condição de disparo compara quem operou (`v_caller_coach_id`)
com o coach titular do aluno, e nunca com o próprio comprador. Quando um coach
compra **para si mesmo**, `resolve_selling_coach` corretamente tira ele de
vendedor (ninguém vende para si) e passa a venda ao coach titular — mas o bônus
de master continua apontando para quem operou, isto é, para o comprador. Ele
tira uma fatia da comissão do próprio coach dele, comprando.

Levantado em 15/09/2026: **28 pedidos, R$ 142,27**, sobre R$ 6.906 de volume.
O maior caso é 17 compras de um mesmo comprador levando 30% da comissão da
coach titular. Contra 41 pedidos legítimos (R$ 347,73), é quase um terço do
mecanismo funcionando ao contrário. **Não corrigido ainda** — corrigir muda
quanto gente já recebeu, e a regra de negócio é do Erick.

**Reprocessar apagava esse bônus.** `admin_reprocess_partner_order` zerava
`master_coach_cross_bonus_amount` e o beneficiário no UPDATE, e
`process_partner_product_order_paid` só recria a comissão quando o beneficiário
está preenchido — então sumia para sempre. Corrigido em 15/09: o beneficiário é
guardado antes e o valor recalculado sobre o líquido novo. **Ao mexer no
reprocessamento, confira também se cada beneficiário continuou recebendo** —
conferir só a taxa e a data não pega esse tipo de perda.

## Pago a mais: o desconto já é automático

Quem sacou além do liberado aparece com `pago_a_mais` em `carteira_atual`, e
`disponivel` fica em zero. **Não é preciso lançar nada à mão para descontar de
ganhos futuros**: como `disponivel = GREATEST(liberado − sacado − gasto − …, 0)`,
todo ganho novo entra primeiro abatendo o débito. Conferido para os dois casos
sem pendente que os cubra (Marilene 31,76 e Erick 59,75) — decisão dele em
15/09/2026 foi justamente descontar em ganhos futuros, que é o que já acontece.

**Não registre esse débito em `wallet_advances`** achando que formaliza: o
extrato subtrai `advance_open` *além* de `liberado − sacado`, e o desconto
sairia em dobro.
