INSERT INTO storage.buckets (id, name, public)
VALUES
  ('group-media', 'group-media', true),
  ('evolution-photos', 'evolution-photos', true),
  ('food-photos', 'food-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE POLICY "Group media public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'group-media');

CREATE POLICY "Evolution photos public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'evolution-photos');

CREATE POLICY "Food photos public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'food-photos');

CREATE POLICY "Students upload own evolution photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'evolution-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Students update own evolution photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'evolution-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Students upload own food photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'food-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Students update own food photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'food-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Group members upload media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'group-media'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Admins manage app media"
ON storage.objects
FOR ALL
USING (
  bucket_id IN ('group-media', 'evolution-photos', 'food-photos')
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id IN ('group-media', 'evolution-photos', 'food-photos')
  AND public.is_admin(auth.uid())
);

ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON public.group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_photos_student_date ON public.evolution_photos(student_id, photo_date DESC);
CREATE INDEX IF NOT EXISTS idx_food_logs_student_date ON public.food_logs(student_id, log_date DESC);