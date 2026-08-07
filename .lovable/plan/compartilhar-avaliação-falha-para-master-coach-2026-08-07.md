# Compartilhar avaliação falha para Master Coach

## O que está acontecendo

Ao clicar em **Compartilhar** no resultado da avaliação, aparece o erro "Avaliação não encontrada" e nenhum link é copiado.

Causa confirmada: a geração do link exige que a avaliação pertença exatamente ao coach logado. Na tela **Avaliar Aluno**, o Master Coach enxerga e avalia alunos de outros coaches da rede — nesses casos a avaliação tem `coach_id` de outro coach, a verificação falha e o link nunca é gerado. Por isso "não copia": o erro acontece antes da cópia.

## Correção

1. Liberar a geração do link quando o solicitante for:
   - o coach dono da avaliação (como hoje), ou
   - Master Coach (mesma checagem `is_master_coach` já usada na aba Avaliar Aluno), ou
   - admin.
   O link continua vinculado ao coach titular da avaliação, para que a página pública `/resultado/{token}` mostre os dados do coach correto do aluno.

2. Aplicar a mesma regra na exclusão do link compartilhado, que hoje tem a mesma restrição.

3. Melhorar o retorno na tela: se o navegador não permitir cópia automática (contexto sem permissão de área de transferência), exibir o link em um aviso com botão de copiar, em vez de falhar em silêncio.

## Detalhes técnicos

- `src/lib/assessment-share.functions.ts`: em `createAssessmentShare` e `deleteAssessmentShare`, substituir `a.coach_id !== coachId → erro` por uma verificação de permissão que aceita dono, master coach (`rpc('is_master_coach', { _coach_id })`) ou perfil com `role = 'admin'`. Ao inserir em `assessment_shares`, usar o `coach_id` da avaliação, não o do solicitante.
- `src/components/coach/FitMindShape.tsx` (`handleShareResult`): fallback de cópia quando `navigator.clipboard` falhar, mostrando o link no toast para cópia manual.
