-- Aula grátis (isca) e correção das regras de liberação — FitMind Club
-- 25/08/2026.
--
-- 1. AULA GRÁTIS
--
-- É o que Kiwify, Eduzz e Hotmart chamam de aula de degustação: algumas aulas
-- abertas para quem ainda não comprou, o resto trancado. É a isca, e hoje não
-- existe aqui.
--
-- A decisão que separa isto de um vazamento: **a ementa é pública, o conteúdo
-- não.** Qualquer pessoa logada passa a ver os módulos e os TÍTULOS das aulas
-- de um curso que está na loja — é exatamente o que a página de venda precisa
-- mostrar. Assistir continua exigindo compra, com uma exceção: a aula marcada
-- como grátis.
--
-- O `video_key` nunca sai do servidor em nenhum dos casos; quem decide o link
-- assinado é `getLessonPlayback`, que passa a aceitar aula de degustação.
--
-- 2. AS REGRAS DE LIBERAÇÃO
--
-- Já existiam três colunas — `unlock_rule`, `unlock_days`, `unlock_at` — com
-- dois CHECK que exigem o complemento:
--
--   dpl_drip_needs_days: unlock_rule <> 'drip' OR unlock_days IS NOT NULL
--   dpl_date_needs_at:   unlock_rule <> 'date' OR unlock_at   IS NOT NULL
--
-- É daí que vem o erro ao escolher "gotejamento" ou "data fixa" no painel: a
-- tela gravava só a regra, sem o complemento, e o banco recusava — com uma
-- mensagem de constraint, que não diz nada para quem está montando um curso.
--
-- A correção principal é na tela (o painel passa a mandar os dois juntos).
-- Aqui vai só a rede embaixo: um default para `unlock_days`, para que trocar
-- para gotejamento nunca mais possa falhar por campo vazio.

begin;

-- ---------------------------------------------------------------------------
-- 1. A coluna
-- ---------------------------------------------------------------------------

alter table public.digital_product_lessons
  add column if not exists is_preview boolean not null default false;

comment on column public.digital_product_lessons.is_preview is
  'Aula de degustação: abre para quem ainda não comprou, enquanto o curso estiver na loja.';

-- Gotejamento sem prazo é o erro que a tela cometia. 7 dias é o costume do
-- mercado e serve de ponto de partida — o criador ajusta na hora.
alter table public.digital_product_lessons
  alter column unlock_days set default 7;

-- ---------------------------------------------------------------------------
-- 2. Ementa pública para curso que está na loja
-- ---------------------------------------------------------------------------
-- Só título e estrutura. O que decide se a aula TOCA é a função de playback,
-- não estas policies.
--
-- `TO authenticated` explícito, como todas as outras. Curso fora da loja
-- (rascunho, em análise, inativo) continua invisível para quem não administra.

drop policy if exists dpm_ementa_publica on public.digital_product_modules;
create policy dpm_ementa_publica on public.digital_product_modules
for select to authenticated
using (
  is_active
  and exists (
    select 1 from public.digital_products d
     where d.id = digital_product_id and d.status = 'active'
  )
);

drop policy if exists dpl_ementa_publica on public.digital_product_lessons;
create policy dpl_ementa_publica on public.digital_product_lessons
for select to authenticated
using (
  is_active
  and exists (
    select 1
      from public.digital_product_modules m
      join public.digital_products d on d.id = m.digital_product_id
     where m.id = module_id and m.is_active and d.status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- 3. Quem pode ASSISTIR esta aula
-- ---------------------------------------------------------------------------
-- Uma função só, para a tela e o servidor não terem regras diferentes sobre a
-- mesma pergunta. É ela que `getLessonPlayback` passa a chamar.

create or replace function public.pode_assistir_aula(_lesson_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.digital_product_lessons l
      join public.digital_product_modules m on m.id = l.module_id
      join public.digital_products d on d.id = m.digital_product_id
     where l.id = _lesson_id
       and l.is_active
       and m.is_active
       and (
         -- aula de degustação, num curso que está na loja
         (l.is_preview and d.status = 'active')
         -- ou acesso normal: comprou, mensalidade, ou administra
         or public.can_view_digital_product_for(m.digital_product_id, _user_id)
       )
  );
$fn$;

revoke execute on function public.pode_assistir_aula(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.pode_assistir_aula(uuid, uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
-- 1) A coluna nasceu, e nasceu falsa para todas as aulas existentes?
--    select count(*) filter (where is_preview) as gratis, count(*) as total
--      from public.digital_product_lessons;
--    -> gratis = 0. Nenhuma aula vira grátis sozinha.
--
-- 2) A ementa abriu só para curso na loja?
--    Logado como aluno SEM o curso:
--      select count(*) from public.digital_product_modules;   -> > 0
--    E o curso em rascunho continua fora:
--      select count(*) from public.digital_product_modules m
--        join public.digital_products d on d.id = m.digital_product_id
--       where d.status <> 'active';                            -> 0
--
-- 3) A função de assistir responde certo?
--    select public.pode_assistir_aula('<id de aula NAO preview>', '<user sem compra>');
--    -> f
--    select public.pode_assistir_aula('<id de aula preview>',     '<user sem compra>');
--    -> t
