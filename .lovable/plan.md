# Tipos do banco + migrations de 22/08

## 1) types.ts — já está atualizado

Conferi o arquivo `src/integrations/supabase/types.ts` que está no projeto hoje. Tudo que você listou já existe nele:

- `digital_product_modules`, `digital_product_lessons`, `digital_lesson_progress` — presentes
- `product_downloads.digital_product_id` — presente (com a relação para `digital_products`)
- `digital_product_lessons.require_watermark` — presente

Ou seja, não há nada a regenerar. Depois de aplicar a migration do curso (item 3), o tipo precisa ganhar só a coluna nova `digital_products.included_for_active_coaches` — isso é regenerado automaticamente quando a migration roda.

## 2) Localização — já aplicada, e o arquivo está desatualizado

`docs/propostas/2026-08-22-localizacao.sql` já foi aplicado no banco. Existem hoje: `normaliza_cidade`, a view `vendedor_local` (revogada de anon/authenticated), `cidades_com_loja()` e `produtos_por_local()`.

Conflito que preciso avisar antes de rodar de novo: a versão no banco tem um `trim()` a mais dentro de `normaliza_cidade`, que o arquivo não tem. Sem o trim, "Cuiabá " e "Cuiabá" voltam a virar cidades diferentes. Reaplicar o arquivo como está seria um retrocesso.

Proposta: **não reaplicar esse arquivo**. Em vez disso, atualizo o arquivo no repositório para refletir exatamente o que está no banco (com o trim), para o repositório parar de divergir. Nenhuma mudança de banco.

Confirmado também: esse arquivo não mexe em grant de coluna de nenhuma tabela, e as políticas de `partners` e a RPC `parceiro_do_dono` continuam intactas — não são tocadas por nada aqui.

## 3) Curso Formação de Coach — aplicar, com dois ajustes

`docs/propostas/2026-08-22-curso-formacao-coach.sql` ainda não foi aplicado. Revisei contra o schema real e está coerente: `coaches.approved_at` / `is_professional` / `profile_id`, `profiles.is_master_admin`, `digital_purchases.student_id/expires_at` e todas as colunas do seed existem. `can_manage_digital_product` e `is_user_blocked_by_subscription` existem.

Dois ajustes necessários:

1. **Bucket `course-videos`**: o `insert into storage.buckets` é bloqueado na plataforma. Crio o bucket privado pela ferramenta de storage (privado, limite 2 GB, mp4/webm/quicktime) e removo esse bloco do SQL. A policy de `storage.objects` (`course_videos_manage`, só master admin) continua na migration normalmente.
2. **Nome da policy de storage**: `course_videos_manage` é `for all` em `storage.objects` sem restrição de comando — mantenho como está no seu arquivo, só garantindo o `drop policy if exists` antes (já está).

O resto vai igual ao seu arquivo:

- coluna `included_for_active_coaches` em `digital_products`
- `can_view_digital_product(uuid)` (comprou OU coach adimplente com curso incluso OU quem administra), sem execute para anon
- `can_view_digital_product_for(uuid, uuid)` para uso no servidor, sem execute para anon nem authenticated
- substituição de `dpm_select` e `dpl_select` para usar o helper novo (hoje elas usam `student_owns_digital_product`, que barraria justamente o coach que recebe o curso pela mensalidade)
- seed do curso, 2 módulos e 4 aulas com ids fixos e `on conflict do update`

Nada disso encosta em `partners`, nas políticas criadas hoje nem em `parceiro_do_dono`.

## Ordem de execução

1. Criar o bucket privado `course-videos` pela ferramenta de storage.
2. Rodar a migration do curso (sem o bloco de bucket).
3. Atualizar `docs/propostas/2026-08-22-localizacao.sql` no repositório para bater com o banco (com o `trim`), sem rodar SQL.
4. Conferir no banco: coluna criada, funções criadas, policies trocadas, curso com 2 módulos e 4 aulas.

Sem alteração de código de frontend neste passo — o player e a tela do curso ficam para um passo seguinte, se você quiser.
