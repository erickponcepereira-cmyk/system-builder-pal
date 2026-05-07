## Escopo do trabalho

Esta é uma lista grande com 11 melhorias diferentes, em áreas distintas do app (avaliação, coachs, metas, loja, gratuitos, relatórios). Vou agrupar por área e executar em ondas para garantir qualidade. Confirme antes de eu iniciar.

---

### Onda 1 — Correções rápidas de UI e bugs

1. **Avaliar Aluno — contraste/cores**
   - Trocar tokens: usar `text-foreground`/`text-white` e `bg-card` corretos no painel de avaliação. Garantir contraste no tema escuro (atual usa `text-muted-foreground` em fundo escuro = ilegível).

2. **Avaliar Aluno — cálculo correto de calorias e TMB**
   - Implementar Mifflin-St Jeor (TMB) + fator de atividade (sedentário/leve/moderado/intenso) para gasto total. Hoje os valores estão errados/placeholders.

3. **Avaliar Aluno — análise de Peso e Gordura**
   - **Peso:** mostrar "X kg acima do limite saudável" (peso atual − peso máx para IMC 24.9 na altura informada).
   - **Gordura:** mostrar "X kg de gordura a perder" calculado por massa gorda atual − massa gorda alvo (% saudável × peso). Diferente do excesso de peso.

4. **Botão WhatsApp em todo lugar que aparece aluno/coach**
   - Componente `<WhatsAppButton phone={...} />` reutilizável que gera `https://wa.me/<numero limpo>`.
   - Adicionar nos cards: lista de Clientes (coach), Avaliar Aluno, lista de Coaches (admin), Aplicações de Coach, perfil do coach, etc.

5. **Link de convite do coach não funciona**
   - Investigar `/r/$code` (registro com indicação) e/ou link de convite enviado pelo coach. Corrigir geração e validação do código (provavelmente cadeia coach→profile→referral_code).

6. **Coachs novos não aparecem no cadastro (CoachSelector)**
   - Verificar a query: hoje deve estar filtrando por `approved_at` ou status. Ampliar para incluir todo coach com `approved_at IS NOT NULL` e `status='active'`. Garantir que ao aprovar um coach ele apareça automaticamente.

7. **Editar metas manualmente na Visão Geral do coach**
   - Tornar o `GoalsCard` editável: botão "Editar metas", inputs para meta de vendas, alunos, comissão, etc. Persistir em uma tabela `coach_goals` (criar se não existir) com RLS.

---

### Onda 2 — Unificação da Loja + Gratuitos editáveis

8. **Unificar Loja Física + Digital → "Loja"** com Seções e Categorias
   - Nova estrutura no banco: `store_sections` (Físicos, Digitais, customizáveis) e `store_categories` (filhas das seções). Migrar `store_products` e `digital_products` para uma tabela unificada `store_items` (kind: physical|digital), preservando dados.
   - Admin: CRUD completo de seções, categorias, produtos (com upload de imagem para o bucket `product-images`).
   - Front aluno: aba "Loja" com tabs por seção e filtros por categoria.

9. **Foto em todos os produtos (físicos e digitais)**
   - Coberto pela unificação acima: campo `image_url` + upload no bucket `product-images` (público).

10. **Renomear "Benefícios" → "Gratuitos"** com seções, categorias e produtos editáveis
    - Tabelas espelhadas: `freebies_sections`, `freebies_categories`, `freebies_items` (com imagem e detalhes).
    - Admin CRUD completo. Front: tela com tabs/filtros. Ao tocar num item, abrir modal/rota com mais informações.
    - Renomear todos os textos/ícones de "Benefícios" para "Gratuitos".

---

### Onda 3 — Relatórios completos

11. **Relatórios admin + coach (com filtro por período)**
    - **Admin:** alunos por desafio (atual e anteriores), comissões por coach, vendas por produto, ranking, etc.
    - **Coach (escopo da rede dele):** seus alunos, alunos da rede (downline 1/2/3), crescimento da rede, metas batidas, maiores comissões, maiores vendas, desafios em que participou, top 1/2/3 alunos por desafio.
    - Filtro por intervalo de datas em todos.
    - Implementar como `createServerFn` com agregações via Supabase + componentes de visualização (lista + barra/tabela).

---

### Detalhes técnicos relevantes

- Migrações Supabase necessárias: `coach_goals`, `store_sections`, `store_categories`, `store_items`, `freebies_sections`, `freebies_categories`, `freebies_items`, bucket `product-images` e `freebies-images` públicos. Migração de dados existentes de `store_products`+`digital_products` para `store_items`. Atualizar `store_order_items` para também aceitar `store_item_id`.
- Manter compatibilidade: `listSellableProducts` continuará funcionando lendo da nova `store_items`.
- WhatsApp helper em `src/lib/whatsapp.ts`.

---

### Como proponho executar

Por causa do tamanho, sugiro entregar **Onda 1 primeiro** (todas as correções rápidas + bugs + cálculos + WhatsApp + metas editáveis + bug de convite + coach selector). Em seguida você revisa e seguimos para a Onda 2 (Loja unificada + Gratuitos) e depois Onda 3 (Relatórios).

Confirma essa abordagem? Se preferir outra ordem (ex.: Loja primeiro), me diz.