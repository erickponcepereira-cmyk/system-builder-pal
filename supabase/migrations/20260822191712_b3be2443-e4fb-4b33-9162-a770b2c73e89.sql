update public.digital_product_lessons
   set allow_download = false
 where kind = 'video';

alter table public.digital_product_lessons
  alter column allow_download set default false;

alter table public.digital_product_lessons
  add column if not exists thumbnail_key text;

update public.digital_product_lessons l
   set require_watermark = true
  from public.digital_product_modules m
 where m.id = l.module_id
   and m.digital_product_id = 'c0a5e000-0000-4000-a000-000000000001';

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