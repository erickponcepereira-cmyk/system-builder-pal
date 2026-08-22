# Corrigir "tudo vira assinatura" no checkout

## O que está acontecendo

Verifiquei o banco e o código do checkout:

- No banco, quase nenhum produto está marcado como assinatura: 9 de 255 produtos de parceiro, 1 de 1.586 de profissional e 2 de 82 produtos FitMind. O padrão da coluna é "não é assinatura". Ou seja, a marcação em massa não existe — o problema é de comportamento na hora de pagar.
- O checkout (Mercado Pago) consulta o produto e, **se ele for assinatura, força o modo "Assinar" automaticamente**: já troca para cartão, esconde o botão de PIX e só deixa a opção avulsa como um segundo clique escondido. É isso que dá a sensação de "obrigatório ser por assinatura" nos produtos do admin (ex.: "adesão sistema estacionamento", criado em 21/08, marcado como recorrente **com** pagamento avulso permitido — mesmo assim abre travado em assinatura).
- Nos formulários de parceiro e profissional, ao desmarcar a caixa de assinatura os campos de recorrência (intervalo, valor, dias de teste) continuam gravados no produto. O produto fica com "resíduo" de assinatura, o que confunde e pode reativar o comportamento em qualquer edição futura.

## O que vou corrigir

1. **Checkout deixa de forçar assinatura**
   - Abre sempre no modo normal (PIX/cartão avulso) quando o produto permite pagamento avulso.
   - "Assinar (cobrança automática)" vira uma escolha visível do cliente, nunca o padrão.
   - Só quando o produto for assinatura **e** o vendedor tiver desmarcado "permitir pagamento avulso" é que o checkout abre travado em assinatura (comportamento intencional).

2. **Formulários de produto (admin, parceiro e profissional) gravam limpo**
   - Ao desmarcar a caixa de assinatura, os campos de recorrência são zerados/limpos no salvamento — em todos os três painéis (hoje só o admin faz isso).
   - A caixa continua desmarcada por padrão em produto novo.

3. **Sinalização clara na lista**
   - Etiqueta "Assinatura mensal/anual" no card do produto nas listas de admin, parceiro e profissional, para o dono ver na hora se algum produto ficou marcado sem querer.

4. **Limpeza dos produtos já marcados**
   - Vou listar os 12 produtos hoje marcados como assinatura para você confirmar quais devem deixar de ser (ex.: os "PEDAL NIGHT" e "adesão sistema estacionamento" parecem venda avulsa) e desmarco só os que você indicar. Nada é alterado sem sua confirmação.

## Detalhes técnicos

- `src/components/payments/MercadoPagoCheckout.tsx`: no efeito que chama `getSourceRecurrence`, parar de executar `setMode("subscribe")` / `setTab("card")` incondicionalmente; passar a definir `mode = r.allowOneTime === false ? "subscribe" : "one_time"` e só forçar a aba cartão nesse caso.
- `src/components/shared/RecurrenceFields.tsx`: ao desmarcar, emitir patch com `recurrence_interval/amount/trial_days = null` e `is_recurring = false`.
- `src/routes/_authenticated/partner.tsx` (save do produto) e `src/components/professional/ProfessionalProductsPanel.tsx` (save): normalizar o payload igual ao `StoreItemsManager` (campos de recorrência só quando `is_recurring`).
- Sem mudança de schema; a limpeza dos 12 registros existentes é feita depois da sua confirmação.
