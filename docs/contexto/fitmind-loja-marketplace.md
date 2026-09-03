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

**Catálogo do Augustus (03/09/2026).** Os 1548 produtos da seção Medicina foram
**desativados, não apagados** (`is_active_by_professional=false`, `is_ready_for_sale=false`)
— há pedidos passados apontando para eles. Snapshot em `auditoria.medicina_antes_20260903`.
No lugar entraram **3.785 procedimentos** de um vendedor só, o Augustus, que revende 41
prestadores via 33Doctor. O que distingue esses produtos: `skip_tax = true` — é por esse
campo que se separa o catálogo novo do antigo nas consultas.

Modo de preço `receive`: a planilha dá o **Vlr. Cliente**, que é o que o prestador tem que
receber no fim da cascata inteira, então `professional_net_amount` é o dado de entrada e
`price` é derivado. Taxa de sistema por faixa, gravada em `system_fee_pct_override`:
**R$ 0–100 → 15%, R$ 101–999 → 10%, R$ 1000+ → 7%.** Sem imposto, 10% de comissão do coach,
rede 10/5/3 em override por produto. Conferido nos três tiers: a cascata devolve o valor da
planilha ao centavo (só em item abaixo de R$ 10 sobra 1 centavo de arredondamento, a favor
do prestador).

**Duas armadilhas de dados da planilha**, ambas já tratadas — se reimportar, trate de novo:
128 linhas perderam a vírgula decimal e vieram exatamente **1500× maiores** (ÁCIDO FÓLICO
como R$ 24.705 em vez de R$ 24,71); e 10 nomes da CANTAROZ vieram corrompidos por OCR
(`Pelve sim les`, `Drenagem de Seroma Parede øbdomem`) e ficaram de fora. As 157 linhas
"sem nome" são cabeçalhos de bloco da planilha, não perda de dado.

**A busca precisou aprender medicina.** Os exames se chamam como no laudo ("RM - CRANIO
ENCEFALO", "USG - ABDOME TOTAL") e o cliente digita "ressonância", "ultrassom". Além do
dicionário de siglas em `SYNONYMS`, duas coisas: a **subcategoria** passou a entrar no
índice (só seção e categoria entravam, então "Hormônios" não achava nada), e o `expand`
passou a casar a chave **por palavra**. Isso último não é detalhe: com `includes`, a sigla
`us` casa dentro de "uso" e `rm` dentro de "dermatológico", e a loja inteira vira exame de
imagem. Chave de 4+ letras ainda casa por prefixo, senão "suplementos" perde o sinônimo
cadastrado como "suplemento".

Produto médico não tem foto e não vai ter. `arteDaTaxonomia` (`src/lib/store-arte-padrao.ts`)
escolhe ícone e paleta pela trilha da taxonomia — sem isso são 3.785 sacolas de compras
idênticas na prateleira.
