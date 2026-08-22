# Correções do motor de aulas (cursos digitais)

Aplicar o pacote enviado como migração no backend, com um ajuste obrigatório: incluir os GRANTs da nova tabela (sem eles o app recebe erro de permissão mesmo com RLS correta).

## O que muda

1. **Parceiro passa a poder criar curso**
   - Nova tabela `partner_created_courses` (espelha `coach_created_courses`): vínculo parceiro ↔ produto digital, percentuais de comissão do criador/plataforma/upline, status e aprovação do admin.
   - Acesso: só o dono da empresa parceira enxerga e edita suas próprias linhas; funções internas do sistema mantêm acesso administrativo.

2. **Regra única de "quem administra o curso"**
   - Nova função `can_manage_digital_product(uuid)` que aceita coach, profissional (que é coach com `is_professional`) e parceiro.
   - As regras de acesso de `digital_product_modules`, `digital_product_lessons` e `digital_lesson_progress` passam a usar essa função no lugar de `coach_owns_digital_product`. A função antiga continua existindo (outros pontos do sistema usam), apenas deixa de ser usada nessas quatro regras.
   - Leitura de aluno permanece igual: só quem comprou vê módulos/aulas.

3. **Campo prometido pelo painel**
   - `digital_product_lessons.require_watermark` (booleano, padrão desligado), para a opção "exigir marca d'água do aluno" por arquivo.

## Verificações após aplicar

- Nenhuma policy dessas 4 tabelas pode aparecer com o papel `{public}`.
- `video_key` só legível por comprador ou administrador do curso.
- A brecha citada em `product_downloads` (leitura liberada para qualquer logado) **não** é alterada nesta migração — fica registrada para uma correção separada, já que mexer nela agora pode quebrar downloads de parceiro/profissional que estão no ar.

## Detalhes técnicos

- Migração idempotente (`create table if not exists`, `add column if not exists`, `drop policy if exists`).
- `can_manage_digital_product` é `security definer`, `stable`, `set search_path = public, pg_temp`, com `execute` revogado de `anon`.
- GRANTs adicionados à tabela nova: `select, insert, update, delete` para `authenticated`; `all` para `service_role`; sem acesso para `anon`.
- Nenhum arquivo de frontend é alterado neste passo — `CreatorCoursesPanel` hoje ainda é a superfície de teste e não faz escrita; a migração só remove o bloqueio para quando ela for ligada.
