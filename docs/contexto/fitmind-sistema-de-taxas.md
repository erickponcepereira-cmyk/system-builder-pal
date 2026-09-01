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
