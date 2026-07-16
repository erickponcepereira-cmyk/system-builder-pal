## Problema

Quando alguém se cadastra como profissional, parceiro ou coach, seu `profile.role` vira `coach` (profissional é coach com `is_professional=true`) ou `partner`. Ao logar e cair no `/student`, o `StudentLayout` redireciona para `/coach` (ou `/partner`/`/professional`), e lá o `SubscriptionGuard` bloqueia a tela inteira com a mensagem "Painel bloqueado por mensalidade em atraso" — sem nenhuma saída para o Painel de Aluno.

Regra desejada: **mensalidade só bloqueia coach/parceiro/profissional. O Painel de Aluno deve continuar sempre acessível**, independentemente do status de mensalidade.

## O que vou mudar

### 1. `src/components/profile/SubscriptionGuard.tsx`
Na tela de bloqueio, adicionar um botão destacado **"Entrar no Painel de Aluno"** que:
- grava `sessionStorage.setItem("fitmind_selected_area", "student")`
- navega para `/student`

Só mostrar o botão quando o usuário tem `students` row (ou seja, tem painel de aluno disponível). Um check leve via `supabase` do lado do cliente, dentro do próprio guard.

### 2. `src/routes/_authenticated/student.tsx` (StudentLayout)
Hoje, se `role` é `coach|manager|director|partner` e `selectedArea !== "student"`, ele redireciona para `/coach` — inclusive quando a pessoa digitou `/student` direto na URL. Vou ajustar para:
- Se o usuário tem `students` row **e** o pathname atual já é `/student*`, tratar como entrada explícita no Painel de Aluno (setar `fitmind_selected_area = "student"` e permitir), em vez de redirecionar para `/coach`.
- Mantém o redirect atual apenas para quem cai em `/student` sem ter `students` row.

Isso garante que qualquer link direto para o Painel de Aluno funciona mesmo com mensalidade em atraso.

## Fora do escopo

- Não mexo em `SubscriptionGuard` nas rotas coach/partner/professional — o bloqueio de mensalidade para elas continua igual.
- Não altero cálculo de fatura, RPC `is_user_blocked_by_subscription` nem carteiras.
- Não mexo no cadastro da Maria Fernanda (já foi liberada manualmente).

## Arquivos afetados

- `src/components/profile/SubscriptionGuard.tsx` — adicionar botão "Entrar no Painel de Aluno" na tela de bloqueio (condicional a ter `students` row).
- `src/routes/_authenticated/student.tsx` — permitir entrada direta em `/student` para quem tem `students` row, mesmo com role coach/professional/partner.
