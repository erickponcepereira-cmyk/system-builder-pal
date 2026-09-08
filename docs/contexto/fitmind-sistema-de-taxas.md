---
name: fitmind-sistema-de-taxas
description: "A fonte única de taxas (taxas_vigentes), as taxas novas de 26/08/2026, e o que na loja ficou de fora de propósito"
metadata: 
  node_type: memory
  type: project
  originSessionId: e1a19465-7811-40be-85b3-a6a1e7085b8d
  modified: 2026-08-26T20:46:57.538Z
---

Todas as taxas do FitMind moram numa tabela só: `public.taxas_vigentes`, lida por `public.taxa_vigente(data)`. Antes viviam cravadas em seis funções SQL, em `partnerFinance.ts`, em `payment_fee_configs` e em `app_settings.product_default_tax` — cópias que discordavam entre si. Mudar taxa hoje é **inserir uma linha com a data nova**; o passado fica intacto por construção, porque toda consulta é por data.

**Taxas vigentes desde 26/08/2026** (antes → agora): maquininha cartão 4,98% (inalterada, é 2,49% de processamento + 2,49% de recebimento), PIX 0,99% (inalterada), imposto 6% → **0%**, sistema 5% → **7%**, rede L1/L2/L3 3/2/1 → **10/5/3**. A rede sai da comissão do coach vendedor, então **ele perde ~9%** — foi calculado, mostrado e aprovado antes de aplicar. Se coaches reclamarem de queda, é isto, e a saída é subir `coach_commission_percentage`.

**O que ficou de fora de propósito:** as fatias (`product_value_slots`) da loja FitMind. A loja é manual por natureza e não lê a taxa vigente para os percentuais de rede/sistema — só o imposto, que por isso zerou sozinho. Inventário levantado: 69 produtos com `network_l1` em 3%, 70 com `l2` em 2%, 71 com `l3` em 1%, 59 com `admin_wallet` em 5%. As outras fatias de `admin_wallet` (11 em 20%, 7 em 60%, 1 em 100%) são produtos em que a FitMind é a produtora — **não mexer**. Há 4 produtos ativos sem fatia de rede nenhuma.

**Bug antigo ainda aberto:** `products.commission_level1` vale 15,00 nos 80 produtos ativos, mas quem paga é a fatia, que vale 3. A loja do coach exibe a coluna — o coach lê 15% e recebe 3%. Os níveis 2 e 3 já batem. Subir as fatias para 10/5/3 conserta os três de graça.

**Armadilha que custou horas:** a leitura da taxa no front rodava só no `useEffect` do `__root`, ou seja, no navegador. As server functions rodam em outro processo, com outra cópia do módulo — e lá ninguém chamava. O simulador de rede calculava com a taxa velha enquanto a venda cobrava a nova, e **nada quebrava para avisar**. Existe agora `taxas-vigentes.server.ts`. Ao mexer em constante compartilhada, pergunte em quantos processos ela existe. Segunda armadilha: mutar objeto não redesenha tela — por isso `aplicarTaxasVigentes` devolve se mudou e o root chama `router.invalidate()`.

O documento vivo é `C:\dev\fitmind-acesso\ESTADO-DAS-TAXAS.html`, publicado em https://claude.ai/code/artifact/cb0477e4-ee7c-4461-b14c-ed52e3e37ca3 — leia antes de mexer em taxa. Método de trabalho em [[fitmind-como-trabalhar]]; o rateio em si em [[fitmind-loja-unificada]].

**Maquininha renegociada, vigência 09/09/2026:** cartão 4,98% → **2,99%**, PIX 0,99% → **0,60%**.
As demais colunas seguem iguais. A vigência é por data **UTC**, então a virada acontece às
20h de Cuiabá do dia anterior — não à meia-noite local. Isso importa quando se escolhe a
data para "não misturar as vendas de hoje".

**A segunda fonte de verdade que sobreviveu:** `payment_fee_configs` ainda existe (7 linhas,
uma `is_default`) e é lida por `mercadopago-impl.server.ts`, `financial.functions.ts` e
`admin-subscriptions.functions.ts`. Ela **não tem vigência por data** — atualizar vale na
hora. Não foi atualizada junto com a taxa de 09/09 justamente por isso: mudá-la antes da
virada faria o registro contábil de hoje divergir do que o Mercado Pago cobra hoje.

**`custom_split` é o portão de todos os overrides.** Em `create_partner_product_order`,
`skip_tax`, `system_fee_pct_override`, `network_l1/l2/l3_pct_override`,
`system_fee_amount_override` e `creator_pct_override` só valem se `custom_split = true`.
Gravar override sem a flag não dá erro nenhum: a venda simplesmente usa o padrão. Foi o que
aconteceu na importação do Augustus — 3.381 produtos precificados a 15%/10% de taxa de
sistema cobrariam os 7% padrão, R$ 31.303 a menos no catálogo inteiro. **Ao gravar produto
com override, ligue `custom_split` na mesma instrução.**

**O preço não se atualiza sozinho quando a taxa muda.** A venda parte do `price` gravado;
nada no banco lê `professional_net_amount`. Em `price_input_mode = 'receive'` o combinado é
o líquido, e o preço é derivado — então toda mudança de maquininha desalinha os dois em
silêncio. `public.recalcular_precos_modo_receive(data, coach_id, aplicar)` refaz a conta:
com `aplicar => false` é simulação. Ela espelha a cascata passo a passo e **escolhe o
centavo conferindo o resultado**, porque o arredondamento por etapa não tem inversa exata.

**`is_admin` recebe o user_id** (`is_admin(auth.uid())`), não existe sem argumento. E em
função que roda como serviço (migration, MCP) `auth.uid()` é NULL — guardas escritas como
`IF NOT is_admin(...)` barram o próprio caminho administrativo.
