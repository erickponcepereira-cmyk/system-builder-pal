-- Capa da aula e trava de download — FitMind Club
-- 22/08/2026. Aplicar depois de 2026-08-22-curso-formacao-coach.sql.

-- ---------------------------------------------------------------------------
-- 1. URGENTE: aula em video nao pode oferecer download
-- ---------------------------------------------------------------------------
-- No seed eu deixei allow_download no padrao (true). Resultado: o menu nativo
-- do player mostrava "Baixar" e o arquivo foi baixado inteiro em teste.
-- Para aula de VIDEO o padrao correto e nao oferecer download.
--
-- allow_download continua existindo e util para material de apoio (kind
-- 'download' ou 'ebook'), onde baixar e justamente o objetivo.
update public.digital_product_lessons
   set allow_download = false
 where kind = 'video';

alter table public.digital_product_lessons
  alter column allow_download set default false;

-- ---------------------------------------------------------------------------
-- 2. Capa da aula (thumbnail), como YouTube e Hotmart
-- ---------------------------------------------------------------------------
-- Objeto no MESMO bucket privado das aulas. Entregue por link assinado, igual
-- ao video: capa de curso pago nao deve ficar em URL publica eterna.
alter table public.digital_product_lessons
  add column if not exists thumbnail_key text;

-- ---------------------------------------------------------------------------
-- 3. Marca d'agua ligada no curso de formacao
-- ---------------------------------------------------------------------------
-- O conteudo e pago (via mensalidade) e nao deve circular. A marca nao impede
-- gravacao - nada em navegador impede - mas identifica quem gravou.
update public.digital_product_lessons l
   set require_watermark = true
  from public.digital_product_modules m
 where m.id = l.module_id
   and m.digital_product_id = 'c0a5e000-0000-4000-a000-000000000001';

-- ---------------------------------------------------------------------------
-- 4. Politica do bucket sem consultar profiles direto
-- ---------------------------------------------------------------------------
-- A politica que escrevi consultava public.profiles dentro da policy. Para
-- usuario anonimo isso estoura "permission denied for table profiles" em vez
-- de negar limpo, porque profiles tem grant de coluna restrito desde 11/08.
-- is_admin() ja existe, e security definer, e e o que as policies de partners
-- passaram a usar depois do incidente de 22/08.
drop policy if exists course_videos_manage on storage.objects;
create policy course_videos_manage on storage.objects
for all to authenticated
using      (bucket_id = 'course-videos' and public.is_admin(auth.uid()))
with check (bucket_id = 'course-videos' and public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Conferencia
-- ---------------------------------------------------------------------------
-- Nenhuma aula de video pode permitir download:
--   select kind, allow_download, count(*)
--   from public.digital_product_lessons group by 1,2;
--
-- Marca d'agua ligada nas 4 aulas do curso:
--   select l.title, l.require_watermark, l.allow_download, l.thumbnail_key
--   from public.digital_product_lessons l
--   join public.digital_product_modules m on m.id = l.module_id
--   where m.digital_product_id = 'c0a5e000-0000-4000-a000-000000000001'
--   order by m.sort_order, l.sort_order;

-- ---------------------------------------------------------------------------
-- 5. Upload pelo criador, nao so pelo admin
-- ---------------------------------------------------------------------------
-- A politica acima libera so admin. Mas o painel do criador precisa que
-- parceiro e profissional subam o video do PROPRIO curso.
--
-- Convencao de caminho: course-videos/<digital_product_id>/<arquivo>
-- Assim a policy descobre de qual curso e o objeto pelo primeiro nivel da
-- pasta e pergunta a can_manage_digital_product, que ja cobre coach,
-- profissional e parceiro.
drop policy if exists course_videos_manage on storage.objects;

create policy course_videos_manage on storage.objects
for all to authenticated
using (
  bucket_id = 'course-videos'
  and (
    public.is_admin(auth.uid())
    or (
      (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and public.can_manage_digital_product(((storage.foldername(name))[1])::uuid)
    )
  )
)
with check (
  bucket_id = 'course-videos'
  and (
    public.is_admin(auth.uid())
    or (
      (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      and public.can_manage_digital_product(((storage.foldername(name))[1])::uuid)
    )
  )
);

-- Os videos do curso de formacao ja subiram em formacao-coach/. Como o caminho
-- antigo nao segue a convencao, so admin mexe neles - o que esta correto, e um
-- curso da propria FitMind. Cursos novos nascem no formato <produto_id>/.
