## Diagnóstico (confirmado no banco)

Puxei os últimos pagamentos com cartão: **todas as recusas recentes são `cc_rejected_high_risk`** (Flavia 85,00; Helton 100,00; Luana 179,90 ×3; e outros). Não é erro de cartão nem de código — é o antifraude do Mercado Pago reprovando por falta de sinais.

Causa: hoje enviamos um payload mínimo (`src/server/mercadopago.server.ts` → `createCardPayment`): valor, token, parcelas, e-mail e CPF. Faltam exatamente os campos que o MP usa para pontuar risco:

- **`device_id`** (fingerprint do `security.js` do MP) — hoje não existe em lugar nenhum do projeto. É o item de maior peso; sem ele, transações caem em high risk com frequência.
- **`additional_info`**: itens (id, título, quantidade, preço), dados do pagador (nome, sobrenome, telefone, endereço), primeira compra/tempo de conta.
- **`statement_descriptor`** e `three_ds_mode` (3-D Secure) — o 3DS transfere a validação ao banco e reduz muito a recusa por risco.

A tabela `saved_payment_cards` já existe no banco (mp_customer_id, mp_card_id, brand, last_four...), mas **não é usada por nenhum arquivo do projeto** — está vazia de código.

## Entrega 1 — Reduzir/eliminar recusas por risco

1. **Device fingerprint**: carregar `https://www.mercadopago.com/v2/security.js` com `view="checkout"` no checkout, ler `window.MP_DEVICE_SESSION_ID` e enviar junto ao criar o pagamento; no servidor, mandar no header `X-meli-session-id`.
2. **Payload completo**: incluir `additional_info` (items da origem — pedido/fatura/produto —, payer com nome, sobrenome, CPF, telefone, endereço quando houver, `registration_date` do perfil) e `statement_descriptor` com o nome da marca.
3. **3-D Secure**: ativar `three_ds_mode: "optional"`; quando o MP devolver `pending_challenge`, exibir o desafio do banco no checkout e concluir o pagamento após a validação.
4. **Coleta de dados no checkout**: exigir CPF e telefone válidos antes de habilitar o botão (payload incompleto é penalizado).
5. **Anti-retentativa**: bloquear novas tentativas no mesmo cartão logo após um `high_risk` (o MP endurece a cada retentativa) e sugerir PIX — hoje já sugerimos, mas sem travar a repetição.
6. **Painel admin**: uma aba de diagnóstico listando tentativas com `status_detail`, para acompanhar a taxa de aprovação depois da mudança.

Observação honesta: `high_risk` também depende da reputação da conta MP. Os itens acima costumam resolver a maior parte, mas se persistir será preciso abrir chamado no MP pedindo revisão do perfil de risco da conta.

## Entrega 2 — Produtos com cobrança recorrente

Você escolheu os dois modelos. Faremos um motor único com dois trilhos:

**Configuração (novo)**
- Campos de recorrência nos produtos (loja, parceiro, profissional): `is_recurring`, `interval` (mensal/anual), `recurrence_amount`, `trial/primeira cobrança`, `engine` (`saved_card` ou `mp_preapproval`).
- Aba "Recorrências" no admin: listar assinaturas ativas, valor, próxima cobrança, status, cancelar/pausar.

**Trilho A — cartão salvo (usa nossas faturas)**
- Ao pagar com cartão marcando "salvar cartão", criar Customer + Card no MP e gravar em `saved_payment_cards` (só o token do MP, nunca o número).
- Nova tabela `recurring_subscriptions` (assinante, produto, valor, dia, cartão, status, próxima cobrança) e `recurring_charges` (histórico de tentativas).
- Rota `/api/public/hooks/recurring-charge` disparada por `pg_cron` diariamente: gera a fatura, cobra o cartão salvo (com device/additional_info), registra sucesso/falha, retenta em D+3 e D+7, e bloqueia/notifica após falha final.
- Integra com o que já existe: `subscription_invoices` para a mensalidade da plataforma e `apply_annual_activation_*` para anuidade.

**Trilho B — assinatura nativa do MP (Preapproval)**
- Para planos simples: criar plano/assinatura no MP e redirecionar o usuário para autorizar.
- O webhook `/api/public/mp/webhook` passa a tratar eventos `preapproval` e `subscription_authorized_payment`, marcando a fatura como paga e disparando as comissões pelo mesmo caminho já usado hoje.

**Tela do usuário**
- Em Perfil → Assinaturas: cartão cadastrado, próxima cobrança, histórico, trocar cartão, cancelar.

## Detalhes técnicos

- Arquivos principais: `src/server/mercadopago.server.ts`, `src/lib/mercadopago-impl.server.ts`, `src/lib/mercadopago.functions.ts`, `src/components/payments/MercadoPagoCheckout.tsx`, `src/routes/api.public.mp.webhook.ts`.
- Novos: `src/lib/recurring.functions.ts` + `recurring.server.ts`, rota de cron, painel admin e aba do usuário.
- Migração: colunas de recorrência nos produtos, tabelas `recurring_subscriptions` e `recurring_charges` com GRANTs e RLS (dono vê o seu; service_role total), RLS na `saved_payment_cards`.
- Cron via `pg_cron` + `pg_net` chamando a rota pública com `apikey`.

## Ordem sugerida

1. Entrega 1 (risco no cartão) — é o que está sangrando hoje.
2. Trilho A (cartão salvo + cron) integrado às faturas atuais.
3. Trilho B (Preapproval) + telas de gestão.
