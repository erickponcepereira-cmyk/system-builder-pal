CREATE TABLE public.brand_themes (
  key text PRIMARY KEY,
  nome text NOT NULL,
  mode text NOT NULL DEFAULT 'dark' CHECK (mode IN ('dark','light')),
  logo_full_url text,
  logo_icon_url text,
  favicon_url text,
  theme_color text NOT NULL DEFAULT '#0B0707',
  background text NOT NULL,
  foreground text NOT NULL,
  card text NOT NULL,
  card_foreground text NOT NULL,
  popover text NOT NULL,
  popover_foreground text NOT NULL,
  primary_color text NOT NULL,
  primary_foreground text NOT NULL,
  secondary text NOT NULL,
  secondary_foreground text NOT NULL,
  muted text NOT NULL,
  muted_foreground text NOT NULL,
  accent text NOT NULL,
  accent_foreground text NOT NULL,
  border text NOT NULL,
  input text NOT NULL,
  ring text NOT NULL,
  sidebar text NOT NULL,
  sidebar_foreground text NOT NULL,
  sidebar_primary text NOT NULL,
  sidebar_primary_foreground text NOT NULL,
  sidebar_accent text NOT NULL,
  sidebar_accent_foreground text NOT NULL,
  sidebar_border text NOT NULL,
  sidebar_ring text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brand_themes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_themes TO authenticated;
GRANT ALL ON public.brand_themes TO service_role;

ALTER TABLE public.brand_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_themes_public_read" ON public.brand_themes
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "brand_themes_admin_write" ON public.brand_themes
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER trg_brand_themes_updated_at
  BEFORE UPDATE ON public.brand_themes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS brand_theme_key text REFERENCES public.brand_themes(key) ON DELETE SET NULL;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS brand_theme_key text REFERENCES public.brand_themes(key) ON DELETE SET NULL;

INSERT INTO public.brand_themes (
  key, nome, mode, theme_color,
  background, foreground, card, card_foreground, popover, popover_foreground,
  primary_color, primary_foreground, secondary, secondary_foreground,
  muted, muted_foreground, accent, accent_foreground, border, input, ring,
  sidebar, sidebar_foreground, sidebar_primary, sidebar_primary_foreground,
  sidebar_accent, sidebar_accent_foreground, sidebar_border, sidebar_ring
) VALUES
('fitmind','FitMind Club','dark','#0B0707',
 '#0B0707','#FFFFFF','#161212','#FFFFFF','#161212','#FFFFFF',
 '#FF4A3D','#FFFFFF','#1F1B1B','#FFFFFF',
 '#1F1B1B','#B7B7B7','#3A1512','#FF8A80','#2A2323','#1F1B1B','#FF4A3D',
 '#0F0B0B','#FFFFFF','#FF4A3D','#FFFFFF','#1F1B1B','#FFFFFF','#2A2323','#FF4A3D'),
('carol','Carol Aventureira','light','#FFC1D8',
 '#FFC1D8','#3A1028','#FFE8F0','#3A1028','#FFE8F0','#3A1028',
 '#F53687','#FFFFFF','#FFD6E5','#3A1028',
 '#FFE3EC','#6E3854','#FFB6D1','#3A1028','#D978A2','#FFF4F8','#F53687',
 '#FFD1E1','#3A1028','#F53687','#FFFFFF','#FFE3EC','#3A1028','#D978A2','#F53687');

UPDATE public.coaches SET brand_theme_key = 'carol' WHERE id = 'bf7efe5a-e408-4447-8581-f6498d18cb26';

CREATE OR REPLACE FUNCTION public.resolver_tema_marca(_coach_id uuid DEFAULT NULL, _profile_id uuid DEFAULT NULL)
RETURNS public.brand_themes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _row public.brand_themes;
BEGIN
  IF _coach_id IS NOT NULL THEN
    SELECT brand_theme_key INTO _key FROM public.coaches WHERE id = _coach_id;
  END IF;

  IF _key IS NULL AND _profile_id IS NOT NULL THEN
    SELECT brand_theme_key INTO _key FROM public.coaches
      WHERE profile_id = _profile_id AND brand_theme_key IS NOT NULL LIMIT 1;

    IF _key IS NULL THEN
      SELECT brand_theme_key INTO _key FROM public.partners
        WHERE profile_id = _profile_id AND brand_theme_key IS NOT NULL LIMIT 1;
    END IF;

    IF _key IS NULL THEN
      SELECT c.brand_theme_key INTO _key
        FROM public.students s
        JOIN public.coaches c ON c.id = s.coach_id
       WHERE s.profile_id = _profile_id AND c.brand_theme_key IS NOT NULL
       LIMIT 1;
    END IF;
  END IF;

  IF _key IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO _row FROM public.brand_themes WHERE key = _key;
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_tema_marca(uuid, uuid) TO anon, authenticated, service_role;