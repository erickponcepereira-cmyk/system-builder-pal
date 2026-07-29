## Situação atual (verificada no código)

- O **banco já tem** os campos de recorrência nas 4 tabelas de produto (`products`, `store_products`, `partner_products`, `professional_products`): `is_recurring`, `recurrence_interval`, `recurrence_amount`, `recurrence_trial_days`, `recurrence_engine`.
- **Nenhuma tela grava esses campos** — nem o editor da loja do admin (`StoreItemsManager`), nem o de parceiro/profissional. Por isso você não encontra o campo: ele nunca foi colocado no formulário.
- O **motor de cobrança existe e funciona** (cron diário + hook `/api/public/hooks/recurring-charge`).
- O painel de teste **já existe**: Admin → Pagamentos → aba **"Recorrentes (cartão)"**, com os botões *Antecipar vencimento* (relógio) e *Cobrar agora* (raio). Eles só aparecem **por assinatura existente** e só no motor "cartão salvo" — como hoje não há nenhuma assinatura criada, a tabela está vazia e nenhum botão aparece.
- A compra de um produto recorrente **não cria assinatura** hoje: só a mensalidade da plataforma cria, pelo card de débito automático no perfil.

## O que será feito

### 1. Campo de recorrência no cadastro de produto (Admin e demais lojas)
No formulário de produto, um bloco novo "Cobrança recorrente":
- Chave **"Este produto é uma assinatura/recorrência"**.
- Quando ligada: **intervalo** (mensal/anual), **valor da recorrência** (padrão = preço do produto), **dias de teste grátis** (opcional).
- Chave **"Permitir também pagamento avulso"** (padrão ligada) → é isso que faz uma mensalidade poder ser vendida das duas formas.
- Aplicado em: `StoreItemsManager` (admin/loja), painel de produtos do **parceiro** e do **profissional**, usando as colunas que já existem.

### 2. Cliente escolhe: assinar no cartão ou pagar avulso
No checkout (`MercadoPagoCheckout`), quando o produto for recorrente:
- Duas opções visíveis: **"Assinar (cobrança automática todo mês)"** e **"Pagar só desta vez"** (PIX ou cartão sem salvar), respeitando a chave de pagamento avulso do produto.
- Escolhendo assinar, a caixa "Salvar este cartão" fica marcada e obrigatória (assinatura exige cartão salvo); PIX fica indisponível para o modo assinatura.
- Nada muda para produtos não recorrentes.

### 3. Criar a assinatura automaticamente após o pagamento aprovado
Ao aprovar um pagamento de cartão salvo de produto recorrente, o sistema cria a linha em `recurring_subscriptions` com título, valor, intervalo, dia de cobrança e próxima data (respeitando dias de teste). A partir daí o cron cobra sozinho e a assinatura aparece na aba **Recorrentes (cartão)** com os botões de teste.

### 4. Visibilidade e gestão pelo cliente
No perfil do usuário, junto do débito automático, listar as assinaturas de produto ativas com valor, próxima cobrança e botão de cancelar (o cancelamento já existe no backend).

## Tutorial (como usar depois de pronto)

1. **Cadastrar**: Admin → Loja → Produtos → *Novo produto* (ou editar um existente) → bloco **"Cobrança recorrente"** → ligar, escolher mensal, valor e se aceita pagamento avulso → Salvar.
2. **Comprar como cliente**: abrir o produto na loja → Comprar → escolher **Assinar** → pagar no cartão (o cartão é salvo automaticamente) ou escolher **Pagar só desta vez**.
3. **Conferir**: Admin → **Pagamentos** → aba **"Recorrentes (cartão)"** → a assinatura aparece como *Ativa* com a próxima cobrança.
4. **Testar sem esperar o mês**: nessa linha, clicar no ícone de **relógio** (antecipar vencimento para hoje) e depois no **raio** (cobrar agora). O resultado aparece em "Últimas cobranças automáticas" como Aprovada ou Recusada com o motivo.
5. **Cancelar/pausar**: pelos ícones da mesma linha (admin) ou pelo próprio cliente no perfil.

## Detalhes técnicos

- Sem migração nova: as colunas de recorrência já existem nas 4 tabelas; será adicionada apenas uma coluna booleana `allow_one_time` se necessário, ou reaproveitado `recurrence_engine` para indicar o modo.
- Criação da assinatura no fluxo aprovado de `mercadopago-impl.server.ts` (mesmo ponto onde o cartão é salvo), reutilizando o payload de `enableAutoDebit` com `product_kind` = tipo do produto e `product_id`.
- `MercadoPagoCheckout` recebe uma prop `recurrence` opcional vinda do modal de produto; sem ela o comportamento atual é preservado.
