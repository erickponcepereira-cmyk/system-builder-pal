## Novo Modal de Coach (substituindo StudentDetailsModal na Árvore da Rede)

Criar um modal dedicado para Coach com informações ricas, usado ao clicar em um coach na Árvore da Rede (1ª linha) e também onde fizer sentido (ranking da rede).

### Conteúdo do modal

1. **Header** — nome, foto, patente oficial, categorias (Master Coach, Nutricionista, Coach HBL, Parceiro, Profissional), último login no app, data de cadastro.
2. **Clientes** — ativos e inativos baseado em `student_attendance` (mesma lógica do painel de Frequência do Aluno).
3. **Patente** — patente atual + data da última patente atingida (a partir de `coach_patent_history` ou equivalente; se não existir histórico, mostrar "sem registro").
4. **Medalha** — última medalha cumulativa atingida + data (a partir de `coach_medal_history` ou snapshot mais recente).
5. **Rede vinculada (diretos)** — total separado por: Coach comum, Coach Profissional, Coach Parceiro.
6. **Metas do mês** — Viagem (alunos ativos / meta) e Jantar (vendas / meta) com % concluído.
7. **Parceiros & Profissionais trazidos** — contagem clicável; ao clicar abre lista com nomes (drill-down inline).
8. **Se Coach Profissional** — lista de produtos cadastrados (nome, preço, status).
9. **Última venda** — data + valor + produto.
10. **Produtos mais vendidos** — resumo top 5, com filtro: Mês atual / Tempo todo.
11. **Coaches trazidos** — contagem com filtro: Último mês / Tempo todo.
12. **Último login** — data/hora do último acesso ao app.
13. **Perfil comportamental** — seção placeholder ("Em breve") com card vazio + lista de "Produtos recomendados para venda" também vazia/placeholder, pronto para receber dados futuros.

### Mudanças técnicas

**Banco**
- Migration: adicionar coluna `last_app_login_at timestamptz` em `profiles` (se não existir).
- Migration: criar trigger/função RPC `touch_last_login()` simples (ou apenas update via server fn).
- Garantir tabelas de histórico de patente/medalha: usar as existentes; se ausentes, fazer fallback no servidor (último snapshot calculado).

**Server**
- `src/lib/coach-modal.functions.ts` (novo): `getCoachModalData(coachId)` que retorna todos os dados acima em um único payload (clientes ativos/inativos, patente+data, medalha+data, breakdown da rede direta, metas do mês, parceiros/profissionais trazidos com nomes, produtos do profissional, última venda, top produtos mês/total, coaches trazidos mês/total, último login, behavioral profile = null).
- `src/lib/last-login.functions.ts` (novo): `touchLastLogin()` server fn (com `requireSupabaseAuth`) que atualiza `profiles.last_app_login_at = now()`.

**Frontend**
- `src/components/coach/CoachProfileModal.tsx` (novo): modal completo com seções acima e tabs internas (Visão geral / Rede / Produtos / Vendas / Perfil).
- `src/components/coach/tabs/NetworkTreeTab.tsx`: voltar a abrir o **novo** `CoachProfileModal` (não o StudentDetailsModal) — usar `coachId` em vez de `studentId`.
- Hook de último login: disparar `touchLastLogin()` uma vez por sessão no shell de cada role (coach/student/admin/professional/partner) — via `useEffect` no componente raiz do shell.
- Aba de Frequência do Aluno (`student_attendance` view): usar `profiles.last_app_login_at` como "último acesso" do aluno.

### Fora de escopo (placeholder)
- O modelo de "Perfil comportamental" e recomendações é apenas UI/placeholder agora, sem lógica.
