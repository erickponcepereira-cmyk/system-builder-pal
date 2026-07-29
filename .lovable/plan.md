## Diagnóstico (verificado no banco)

**O que está certo:**
- O prazo configurado é de 7 dias, tanto para comissão de venda quanto para indicação de aluno.
- A rotina automática de liberação roda todo dia às 03:00, rodou hoje e concluiu com sucesso.
- Não existe nenhuma comissão com data de liberação vencida ainda marcada como pendente, nem comissão sem data de liberação. Ou seja: o mecanismo de liberação funciona.

**O que está errado:**
A data de liberação é gravada como "agora + 7 dias" no instante em que a venda é processada, e não como "data do pagamento + 7 dias". Sempre que uma venda é reprocessada (o que fizemos várias vezes nas correções financeiras recentes), o relógio dos 7 dias **recomeça do zero**.

Efeito hoje: **28 comissões, somando R$ 542,71**, de vendas pagas entre 22/06 e 22/07, estão com liberação remarcada para 04 e 05/08 — algumas com mais de 40 dias de atraso em relação ao que a regra deveria ter dado. Atinge, entre outros, Nathan, Erick, Ana Flávia, Vitória, Jorge, Delma, Vimark e Valdenici.

## Correção proposta

**1. Regra passa a contar da data do pagamento**
Ajustar o motor financeiro (`process_paid_transaction`) para gravar a liberação como *data do pagamento da venda + 7 dias* (com recuo para a data de criação da venda quando o pagamento não tiver data registrada). Assim, reprocessar uma venda deixa de empurrar o dinheiro para frente — o reprocessamento passa a ser seguro do ponto de vista de prazo.

**2. Acerto das 28 comissões afetadas**
Recalcular a data de liberação dessas comissões pendentes com base na data real do pagamento. As que já passaram dos 7 dias são liberadas na hora e as carteiras dos beneficiários são recalculadas, para o painel de Pagamentos e as carteiras baterem imediatamente.

**3. Conferência final**
Depois do acerto, rodar uma verificação mostrando: quantas comissões ficaram disponíveis, o valor total liberado por pessoa e a confirmação de que não sobrou nenhuma pendente com prazo já vencido.

## Detalhes técnicos

- Alteração de banco (migração) na função `process_paid_transaction`: trocar `NOW() + commission_release_days` por `COALESCE(tx.paid_at, tx.created_at, NOW()) + commission_release_days` nos três pontos onde a comissão é inserida (slots configurados, fluxo de indicação e fluxo padrão). Mesmo tratamento para `commission_release_referral_days`.
- Correção das linhas históricas entra como operação de dados (não migração), seguida de `recalc_wallets_for_owner` para cada beneficiário atingido.
- A rotina `release_due_commissions_cron` não muda — ela já libera corretamente tudo que tem `available_at <= now()`.
- Nenhuma mudança de interface.
