
-- ============================================================
-- LGPD HARDENING — restrict anon column access + storage owner checks
-- ============================================================

-- 1) PARTNERS: restrict anonymous SELECT to public-vitrine columns only
REVOKE SELECT ON public.partners FROM anon;
GRANT SELECT (
  id, profile_id, fantasy_name, photo_url, cover_url, description,
  business_area, specialty, city, state, status, approved_at,
  created_at, updated_at, instagram, facebook, website,
  referral_code, upline_coach_id, card_valid_until, document_type
) ON public.partners TO anon;

-- 2) PROFILES: restrict anonymous SELECT to safe public fields only
--    (authenticated keeps prior column grants from Phase 6)
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, user_id, name, avatar_url, photo_url, role,
  city, state, bio, instagram, patent, created_at
) ON public.profiles TO anon;

-- 3) STORAGE — avatars: require folder == auth.uid() for UPDATE/DELETE
DROP POLICY IF EXISTS "avatars authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "avatars authenticated delete" ON storage.objects;

CREATE POLICY "avatars owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Also tighten insert to owner folder (was unrestricted with no qual)
DROP POLICY IF EXISTS "avatars authenticated insert" ON storage.objects;
CREATE POLICY "avatars owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4) STORAGE — group-media: require the uploader to be a member of the group
DROP POLICY IF EXISTS "Group members upload media" ON storage.objects;
CREATE POLICY "Group members upload media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-media'
    AND (storage.foldername(name))[1] IN (
      SELECT gm.group_id::text
      FROM public.group_members gm
      JOIN public.profiles p ON p.id = gm.profile_id
      WHERE p.user_id = auth.uid()
        AND COALESCE(gm.is_banned, false) = false
    )
  );
