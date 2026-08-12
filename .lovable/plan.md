# Compradores por mês + ranking dos desafios

## 1. Lista de compradores (parceiro e profissional)

O modal "Compradores" já existe nos produtos de parceiro e profissional, mas hoje mostra uma lista corrida. Ele passa a:

- Agrupar por mês (ex.: "Agosto/2026"), do mês mais recente para o mais antigo, e dentro de cada mês da compra mais recente para a mais antiga.
- Mostrar por mês um resumo: quantidade e valor de pagas, pendentes e canceladas.
- Manter os filtros atuais (Pagas / Pendentes / Canceladas / Todas) e a busca por nome.
- Exibir em cada comprador:
  - Nome e telefone (com WhatsApp)
  - Data da compra e valor
  - Status (pago / pendente / cancelado)
  - **Coach responsável do comprador** (o coach ao qual a pessoa está vinculada), além do coach vendedor que já aparece hoje.
- Botão de exportar CSV com todas as colunas.

## 2. Participantes e ranking do desafio de corrida

Nova aba/visão "Participantes" dentro do painel de desafios de corrida (painel do profissional/organizador do desafio), por desafio:

- Lista de quem está participando, com faixa escolhida (ex.: meta de 50 km), km acumulados no período, % da meta e km faltando.
- **Ranking**: ordenado por % da meta (quem está mais perto de bater primeiro); quem já bateu aparece no topo com selo "Meta batida" e a data.
- Coach responsável de cada participante ao lado do nome.
- Contadores no topo: inscritos, quantos bateram a meta, % médio.
- Busca por nome, filtro por faixa e por coach, e exportação CSV.

## Detalhes técnicos

- `src/lib/product-buyers.server.ts`: incluir na consulta o coach responsável do comprador (via `students.coach_id` → `coaches.profile_id` → `profiles.name`) e devolver `responsibleCoachName` em `ProductBuyerRow`.
- `src/components/products/ProductBuyersModal.tsx`: agrupar `buyers` por `YYYY-MM` com `useMemo`, cabeçalho de mês com totais, exibir coach responsável e botão de CSV. Sem mudança na autorização já existente.
- `src/lib/run-challenges.functions.ts`: nova server function `listRunChallengeParticipants` (`requireSupabaseAuth`), autorizando apenas o dono do desafio (`run_challenges.owner_coach_id` entre os coach ids do usuário) ou admin. Lê `run_challenge_entries` do desafio, resolve nome/telefone via `profiles`, o coach responsável via `students`/`coaches`, a meta via `run_challenge_tiers` e o progresso via a RPC `run_challenge_progress` por participante (em lote, com `Promise.all` limitado).
- `src/components/professional/RunChallengesPanel.tsx`: botão "Participantes" em cada desafio abrindo um `ModalShell` com o ranking, filtros e CSV.
- Sem migração de banco.
