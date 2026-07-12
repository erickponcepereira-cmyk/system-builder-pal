## Diagnóstico

Ao consultar o banco encontrei o seguinte estado das seções e produtos:

- **FitMind Suplementos** (id `11111111-…-001`): imagem OK e **56 produtos** já vinculados por `section_id` (Shake, Whey, BCAA, Xtra-Cal, Liftoff etc.). Essa seção **já deveria aparecer** com todos os itens na loja do aluno — se não está, é cache do navegador.
- **Suplementos (Parceiros/Profissionais)** (id `11111111-…-002`): imagem OK, mas apenas **1 produto** vinculado. Não há produtos "órfãos" no banco de parceiros com nome Herbalife/Shake/Whey para migrar automaticamente.
- **Herbalife (legado)** e **Herbalife (Parceiros) (legado)**: já estão inativos, sem produtos vinculados.
- Duas seções compartilham o mesmo `sort_order` (Herbalife legado = 7 e Suplementos-fitmind = 7; idem 11 nas outras), o que pode fazer a ordem "acima do Herbalife" ficar aleatória visualmente.

Ou seja: no banco já está quase tudo certo, o que falta é **garantir a substituição limpa** para que nada de Herbalife apareça mais e a nova seção Suplementos ocupe visualmente o mesmo lugar em ambas as lojas — hoje e no futuro.

## O que vou fazer

### 1. Reindexar todos os produtos "Herbalife"/suplementos para Suplementos
Numa migração de dados única, movo para as duas novas seções Suplementos qualquer produto (nas tabelas `products`, `partner_products`, `professional_products`) que:
- esteja com `section_id` apontando para uma das seções legado (`Herbalife (legado)` ou `Herbalife (Parceiros) (legado)`), OU
- tenha `is_herbalife = true` (na tabela `store_products`) e ainda não esteja em Suplementos, OU
- não tenha `section_id` e o nome contenha "Herbalife".

Regra: produto da audiência FitMind vai para Suplementos-FitMind (`…-001`); produto de parceiro/profissional vai para Suplementos-Parceiros (`…-002`).

### 2. Encerrar formalmente as seções antigas
- Marco `Herbalife (legado)` e `Herbalife (Parceiros) (legado)` como `is_active = false` (já estão) e renomeio para deixar claro que não devem mais ser editadas (`Herbalife (desativado — migrado p/ Suplementos)`).
- Ajusto o `sort_order` das duas novas seções para **um número imediatamente abaixo** das seções irmãs de mesma audiência (garantindo posição estável acima do que sobrou de Herbalife e evitando empates).

### 3. Blindar o comportamento futuro
- Adiciono um **trigger** em `products`, `partner_products` e `professional_products` que, **antes de INSERT/UPDATE**, se o produto for `is_herbalife = true` (ou o nome começar com "Herbalife ") e o `section_id` estiver vazio, vincula automaticamente à seção Suplementos correspondente à audiência. Isso evita que qualquer produto novo cadastrado como Herbalife caia "fora" da seção Suplementos.
- Nada muda no frontend do aluno/parceiro; a lista já lê por `section_id` (`StorePage.tsx` linha 500 e `PartnerProfessionalStore.tsx` linha 504), então assim que os `section_id` estiverem corretos os cards aparecem sozinhos com imagem, preço e itens.

### 4. Verificação
Após aplicar a migração, rodo `SELECT` de contagem por `section_id` em cada tabela e confirmo pelo preview que:
- a seção **Suplementos** aparece acima de qualquer resquício de Herbalife nas duas lojas,
- as imagens carregam,
- os itens (56 na FitMind + os que existirem em parceiros) aparecem dentro dela.

## Não vou fazer

- Não vou apagar as seções antigas nem os produtos — só desativar/renomear, para preservar histórico de pedidos.
- Não vou mexer no cálculo de comissão, no fluxo de checkout, nem em RLS.
- Não vou criar produtos novos "chutando" nomes de Herbalife para preencher Suplementos-Parceiros — se ficar com poucos itens é porque de fato há poucos cadastrados; nesse caso te aviso para você/parceiros adicionarem.
