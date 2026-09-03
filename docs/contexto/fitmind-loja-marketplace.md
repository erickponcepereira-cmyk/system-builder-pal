---
name: fitmind-loja-marketplace
description: "A loja unificada virando marketplace — o que já foi corrigido, o que a Lovable corrigiu sozinha, e o que falta"
metadata: 
  node_type: memory
  type: project
  originSessionId: e1a19465-7811-40be-85b3-a6a1e7085b8d
  modified: 2026-08-29T12:50:57.275Z
---

A "loja nova" do FitMind é `src/components/store/UnifiedStorePage.tsx` (~2300 linhas) + `src/lib/unified-store.ts` + os `src/lib/store-*.ts`. É um marketplace multi-vendedor: **1904 produtos ativos de 37 vendedores**, de quatro origens (`products`, `partner_products`, `professional_products`, cursos). A loja antiga (`src/components/student/StorePage.tsx`) continua viva em `/student/loja-antiga` como saída de emergência.

**A armadilha número um: o repo deriva embaixo de você.** A Lovable publica sozinha, em paralelo, e já corrigiu coisas antes de eu chegar — a paginação (o teto de 1000 linhas do PostgREST, que `.limit(5000)` NÃO ultrapassa: o servidor corta e responde 200 sem erro) e a busca do catálogo. **Sempre `git fetch` e revalidar cada achado contra o código de agora antes de escrever.** Diagnóstico de uma hora atrás já pode estar obsoleto.

**Corrigido em 29/08/2026** (commits `a20a79b8`, `ea774694`, `68a0cdbd`, `b812258a`): endereço de entrega para produto físico — `exigeEntrega` adivinhava por `stock != null` e dava falso para o catálogo FitMind inteiro; **18 pedidos pagos de 10/06 a 21/08 saíram sem endereço**. Cabeçalho que quebrava uma palavra por linha (`shrink-0` congela a largura e torna o `flex-wrap` inerte; o carrinho ia para fora da tela em 3 de 4 superfícies). Gratuitos que somavam o país inteiro (R$ 7.375,50). Trilhos que repetiam a grade. Ganhos do coach ausentes em 1823 dos 1904 produtos. Estorno (`return_requests` existia desde julho, com RLS pronta e **zero** telas) e avaliações (não existia nada).

**Duas RLS que pareciam prontas e não estavam:** a de `return_requests` UPDATE não tinha `WITH CHECK` — o próprio aluno podia se aprovar. E em `product_reviews`, a RLS só checa o `author_id`, nunca se o PEDIDO é seu; sem gatilho, um uuid alheio deixava avaliar compra que nunca aconteceu. **RLS que só checa "quem sou eu" não checa "isso é meu".**

**Ainda aberto:** página do vendedor (o `sellerName` já aparece, falta a empresa com confiabilidade e outros produtos); design de desktop (**zero** breakpoints `md:`/`lg:` na loja inteira — foi desenhada só para 430px); os 8 overlays escritos à mão com `z-50`, que empata com o `SupportCoachFab` e perde do header do coach em `z-[70]` — existe um `ModalShell` pronto e correto que eles não usam; seções com nome duplicado no banco ("Suplementos" tem duas linhas, 57 + 56 produtos, e clicar mostra só metade); e substituir os 1548 produtos da seção Medicina, que o Erick tem numa planilha.

Taxas e rateio em [[fitmind-sistema-de-taxas]]. Método de trabalho em [[fitmind-como-trabalhar]].

**Visibilidade canônica (03/09/2026):** um produto de parceiro/profissional só entra na busca depois de passar pelos critérios da própria origem: aprovado, publicado pelo vendedor, pronto para venda, não arquivado e com responsável válido. Não remova esses filtros para “fazer aparecer”. `store_admin_shelf_report()` espelha esses bloqueios e deve ser a primeira consulta em incidentes de catálogo. Mudanças em `is_active_by_partner` e `is_active_by_professional` são auditadas em `store_product_visibility_audit`; ocultar um produto aprovado exige confirmação na interface.
