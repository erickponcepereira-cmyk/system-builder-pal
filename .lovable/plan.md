## O que está acontecendo

**1. Categorias não aparecem na loja pública** — confirmado no banco: as regras de leitura de `store_sections`, `store_categories` e `store_subcategories` estão liberadas apenas para usuários **logados**. Quem entra sem conta recebe lista vazia, então nenhum produto ganha nome de seção e não há como agrupar/filtrar.

**2. Loja de parceiro e profissional não aparece** — a loja pública (`/loja`) lê somente a tabela geral de produtos. Os produtos de parceiros e de profissionais estão em tabelas separadas e simplesmente não são consultados. As regras de leitura dessas duas tabelas já permitem acesso público (apenas itens aprovados/ativos), então falta só buscá-los.

**3. Celular específico com "erro de conexão"** — isso não é bug de código: o site abre normalmente em outros aparelhos e no computador. Erro de conexão em um único celular é resolução de DNS/rede daquele aparelho (cache de DNS da operadora, DNS privado, VPN ou bloqueio). O plano inclui uma verificação e instruções, não uma alteração de código — a menos que a verificação mostre algo do lado do domínio.

## O que será feito

### A. Liberar seções e categorias para visitantes
Migração ajustando as regras de leitura de `store_sections`, `store_categories` e `store_subcategories` para permitir leitura pública dos registros ativos (somente leitura; nada de escrita, nada de dado financeiro).

### B. Loja pública passa a incluir parceiros e profissionais
Em `src/lib/public-store.ts`:
- Buscar também os produtos de parceiros (apenas aprovados) e de profissionais (apenas aprovados e ativos), sempre com lista explícita de colunas de vitrine — nunca custo, taxa, comissão ou cupom.
- Normalizar os três formatos para o mesmo tipo `PublicProduct`, marcando a origem (`partner` / `professional`).
- Trazer também a seção/categoria de cada item para agrupar.

### C. Navegação por seções e categorias em `/loja`
Em `src/routes/loja.tsx`:
- Faixa de filtros por seção (chips), com contagem, e subfiltro de categoria quando a seção tiver.
- Abas passam a ser: Produtos · Parceiros · Profissionais · Benefícios (mantendo a busca funcionando em todas).
- Estado vazio explicando quando não há item na seção escolhida.
- Cartão continua levando ao permalink `/produto/{id}`, que já existe e já gera preview de link.

### D. Verificação do celular
- Conferir se o domínio e o `www` estão resolvendo corretamente e respondendo em HTTPS.
- Se estiverem corretos, o retorno será a orientação prática para o aparelho: testar em rede móvel vs Wi-Fi, desligar DNS privado/VPN, limpar dados do navegador. Se a verificação mostrar problema real de domínio, isso vira um item de correção separado.

## Detalhes técnicos

- Migração toca somente políticas de `SELECT` das três tabelas de taxonomia da loja; as políticas de administração permanecem intactas.
- Nenhuma alteração na loja logada (`StorePage.tsx`, `PartnerProfessionalStore.tsx`) — risco zero de regressão na área autenticada.
- `fetchPublicCatalog` passa a fazer as consultas em paralelo e a degradar em silêncio se uma das fontes falhar, para a loja nunca ficar em branco.
- Colunas proibidas continuam bloqueadas pela lista explícita já documentada no topo de `public-store.ts`.
