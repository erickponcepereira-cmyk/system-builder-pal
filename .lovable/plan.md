## Problema

Quando o usuário compartilha o link de indicação do **painel Parceiro**, o link usa `partners.referral_code`. A função `validate_referral_code` resolve esse código retornando `coach_id = partners.upline_coach_id` — ou seja, o convidado é vinculado ao **coach acima do parceiro (upline)**, e não ao próprio parceiro/coach que compartilhou. Se essa pessoa já é coach, o esperado é que o convite vincule diretamente a ela como coach.

O painel Profissional já usa `coaches.referral_code` na origem (`professional.tsx` linha 116/143 → passado para `ProfessionalCollaboratorsPanel`), então esse fluxo já está correto. A correção necessária é apenas no painel Parceiro.

Não é necessário alterar a função `validate_referral_code` nem os formulários de cadastro — eles já tratam corretamente `kind = 'coach'`.

## Regra

Ao gerar o link `/r/<código>` no painel Parceiro:

- Se o dono do painel também tem registro em `coaches` (`coachCtx` já carregado em `load()` — linha 137-163 de `src/routes/_authenticated/partner.tsx`) e possui `referral_code` de coach → usar `coaches.referral_code`.
- Caso contrário → manter o comportamento atual (`partners.referral_code`).

Isso vale para todos os pontos onde o link/QR é exibido: aba visão geral do parceiro e aba Colaboradores.

## Alterações

**`src/routes/_authenticated/partner.tsx`**

1. Adicionar `coachReferralCode?: string | null` ao props de `Overview` e `CollaboratorsPanel`; passar `coachCtx?.referralCode ?? null` do componente pai.
2. Em `Overview` (linha ~279): trocar
   ```
   const referralLink = partner.referral_code ? `${origin}/r/${partner.referral_code}` : "";
   ```
   por uma expressão que prefere `coachReferralCode` e cai para `partner.referral_code`. Ajustar também o texto "Código: …" se for exibido.
3. Em `CollaboratorsPanel` (linhas 1548-1620): mesmo tratamento — `const code = coachReferralCode || partner.referral_code;` e usar `code` em `link`, no guard de "código ainda não gerado" e no rótulo "Código: …".

Nenhuma outra tela do Parceiro monta o link a partir de `partner.referral_code` (verificado com `rg`).

## Verificação

- Compartilhar o link como Parceiro que **também é coach** → `/r/<coach_code>` → `validate_referral_code` retorna `kind='coach'`, `coach_id = coach.id` → cadastros novos ficam vinculados ao próprio coach.
- Parceiro **sem** registro de coach → mantém `/r/<partner_code>` → comportamento atual preservado.
- Painel Profissional: já usa `coaches.referral_code`, nenhum ajuste necessário. Conferir apenas que segue funcionando.

## Fora de escopo

- Backfill/mudança da RPC `validate_referral_code`.
- Fluxo do painel Coach e da vitrine do aluno (já usam código do coach via `useMyReferralCode`).
