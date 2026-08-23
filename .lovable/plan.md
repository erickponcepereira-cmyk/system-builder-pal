# Carteirinha: exceções com histórico (banco + tela de admin)

## Etapa 1 — Migration (exatamente o SQL enviado)

Uma migration única com os 5 blocos, sem alterar nada do conteúdo:

1. Tabela `membership_card_overrides` (perfil, escopo aluno/membro, válido até, motivo, valor anterior, ativo, quem criou/revogou), índice único de exceção ativa por escopo, RLS (admin ou o próprio dono lê) e os GRANTs.
2. `carteirinha_situacao(profile_id)` — devolve calculado / exceção / vigente / origem / válido hoje / motivo, para aluno e para membro, mais o histórico.
3. `carteirinha_definir_excecao(...)` — registra a exceção (motivo obrigatório), guarda o valor anterior e grava a nova data.
4. `carteirinha_revogar_excecao(...)` — desativa a exceção e devolve a data calculada.
5. `recalculate_student_card_access` — passa a respeitar a exceção ativa, para o recálculo não apagar mais a edição manual.

Nada retroativo: nenhum UPDATE/INSERT/DELETE em dados existentes além do que as próprias funções fazem quando forem chamadas.

## Etapa 2 — Tela de admin

Rota nova `/admin/carteirinha`, com item no menu lateral do admin (permissão de usuários/alunos, mesmo padrão visual das outras telas).

**Busca**: campo por nome ou e-mail para escolher a pessoa.

**Dois cartões lado a lado** — "Carteirinha de aluno" e "Carteirinha de membro (coach/parceiro/profissional)". Cada um mostra:

- data vigente em destaque, com selo verde "válida" ou vermelho "vencida"
- linha menor: "calculado pelas compras: dd/mm/aaaa" (aluno) ou "calculado pela mensalidade: dd/mm/aaaa" (membro)
- havendo exceção ativa: tarja de aviso "Exceção manual até dd/mm/aaaa — motivo", com botão "Voltar ao calculado" (pede confirmação)
- não havendo: botão "Definir exceção"

**Formulário de exceção**: até quando (data) + motivo (obrigatório, com o aviso "explique por que, isso fica no histórico"). Ao salvar, recarrega a situação.

**Tabela "Histórico de alterações"** abaixo: quando, escopo, de → para, motivo, quem fez, estado (ativa / revogada em dd/mm/aaaa por quem). Mais recente primeiro, linhas revogadas esmaecidas.

## Regras respeitadas

- A tela só chama as três funções: `carteirinha_situacao`, `carteirinha_definir_excecao`, `carteirinha_revogar_excecao`.
- Nunca escreve direto em `students/coaches/partners.card_valid_until`.
- Não usa `admin_set_coach_card_validity` e não a remove (fica apenas sem uso nesta tela).
- Nenhum cálculo duplicado no front; datas em dd/mm/aaaa; sem identidade visual nova.
- Nenhuma outra tela, função ou tabela é alterada.
