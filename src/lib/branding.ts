// White label / branding dinâmico
// Um único sistema FitMind com temas visuais guardados no banco (tabela brand_themes).

import fitmindIcon from "@/assets/fitmind-icon.png.asset.json";
import fitmindSplash from "@/assets/fitmind-splash.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

export type BrandThemeKey = string;

export interface BrandTheme {
  key: BrandThemeKey;
  name: string;
  mode: "dark" | "light";
  logoFull: string;
  logoIcon: string;
  faviconUrl: string;
  themeColor: string;
  // Tokens (aceitos como qualquer valor CSS: hex, oklch, etc.)
  tokens: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    border: string;
    input: string;
    ring: string;
    sidebar: string;
    sidebarForeground: string;
    sidebarPrimary: string;
    sidebarPrimaryForeground: string;
    sidebarAccent: string;
    sidebarAccentForeground: string;
    sidebarBorder: string;
    sidebarRing: string;
  };
}

export const FITMIND_THEME: BrandTheme = {
  key: "fitmind",
  name: "FitMind Club",
  mode: "dark",
  logoFull: fitmindSplash.url,
  logoIcon: fitmindIcon.url,
  faviconUrl: fitmindIcon.url,
  themeColor: "#0B0707",
  tokens: {
    background: "#0B0707",
    foreground: "#FFFFFF",
    card: "#161212",
    cardForeground: "#FFFFFF",
    popover: "#161212",
    popoverForeground: "#FFFFFF",
    primary: "#FF4A3D",
    primaryForeground: "#FFFFFF",
    secondary: "#1F1B1B",
    secondaryForeground: "#FFFFFF",
    muted: "#1F1B1B",
    mutedForeground: "#B7B7B7",
    accent: "#3A1512",
    accentForeground: "#FF8A80",
    border: "#2A2323",
    input: "#1F1B1B",
    ring: "#FF4A3D",
    sidebar: "#0F0B0B",
    sidebarForeground: "#FFFFFF",
    sidebarPrimary: "#FF4A3D",
    sidebarPrimaryForeground: "#FFFFFF",
    sidebarAccent: "#1F1B1B",
    sidebarAccentForeground: "#FFFFFF",
    sidebarBorder: "#2A2323",
    sidebarRing: "#FF4A3D",
  },
};

/** Linha da tabela `brand_themes` (nomes de coluna em snake_case). */
export interface BrandThemeRow {
  key: string;
  nome: string | null;
  mode: string | null;
  logo_full_url: string | null;
  logo_icon_url: string | null;
  favicon_url: string | null;
  theme_color: string | null;
  background: string;
  foreground: string;
  card: string;
  card_foreground: string;
  popover: string;
  popover_foreground: string;
  primary_color: string;
  primary_foreground: string;
  secondary: string;
  secondary_foreground: string;
  muted: string;
  muted_foreground: string;
  accent: string;
  accent_foreground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebar_foreground: string;
  sidebar_primary: string;
  sidebar_primary_foreground: string;
  sidebar_accent: string;
  sidebar_accent_foreground: string;
  sidebar_border: string;
  sidebar_ring: string;
}

export const COLUNAS_TEMA =
  "key, nome, mode, logo_full_url, logo_icon_url, favicon_url, theme_color, background, foreground, card, card_foreground, popover, popover_foreground, primary_color, primary_foreground, secondary, secondary_foreground, muted, muted_foreground, accent, accent_foreground, border, input, ring, sidebar, sidebar_foreground, sidebar_primary, sidebar_primary_foreground, sidebar_accent, sidebar_accent_foreground, sidebar_border, sidebar_ring";

export function rowToTheme(row: BrandThemeRow): BrandTheme {
  const icone = row.logo_icon_url || row.logo_full_url || fitmindIcon.url;
  return {
    key: row.key,
    name: row.nome || row.key,
    mode: row.mode === "light" ? "light" : "dark",
    logoFull: row.logo_full_url || icone,
    logoIcon: icone,
    faviconUrl: row.favicon_url || icone,
    themeColor: row.theme_color || row.background,
    tokens: {
      background: row.background,
      foreground: row.foreground,
      card: row.card,
      cardForeground: row.card_foreground,
      popover: row.popover,
      popoverForeground: row.popover_foreground,
      primary: row.primary_color,
      primaryForeground: row.primary_foreground,
      secondary: row.secondary,
      secondaryForeground: row.secondary_foreground,
      muted: row.muted,
      mutedForeground: row.muted_foreground,
      accent: row.accent,
      accentForeground: row.accent_foreground,
      border: row.border,
      input: row.input,
      ring: row.ring,
      sidebar: row.sidebar,
      sidebarForeground: row.sidebar_foreground,
      sidebarPrimary: row.sidebar_primary,
      sidebarPrimaryForeground: row.sidebar_primary_foreground,
      sidebarAccent: row.sidebar_accent,
      sidebarAccentForeground: row.sidebar_accent_foreground,
      sidebarBorder: row.sidebar_border,
      sidebarRing: row.sidebar_ring,
    },
  };
}

const cache = new Map<string, BrandTheme>();

/** Busca um tema pela chave (com cache em memória). */
export async function getThemeByKey(key: BrandThemeKey | null | undefined): Promise<BrandTheme> {
  if (!key || key === "fitmind") return FITMIND_THEME;
  const emCache = cache.get(key);
  if (emCache) return emCache;
  const { data } = await supabase
    .from("brand_themes" as never)
    .select(COLUNAS_TEMA as never)
    .eq("key" as never, key as never)
    .maybeSingle();
  if (!data) return FITMIND_THEME;
  const tema = rowToTheme(data as unknown as BrandThemeRow);
  cache.set(key, tema);
  return tema;
}

/** Lista todos os temas cadastrados (uso no painel do admin). */
export async function listarTemas(): Promise<BrandTheme[]> {
  const { data } = await supabase
    .from("brand_themes" as never)
    .select(COLUNAS_TEMA as never)
    .order("nome" as never);
  return ((data as unknown as BrandThemeRow[]) || []).map(rowToTheme);
}

/**
 * Resolve o tema a partir do contexto disponível:
 * - coachId do aluno
 * - profileId do usuário logado (dono do tema)
 * - override manual (ex.: cadastro por indicação antes de haver sessão)
 *
 * A consulta é feita na tabela `brand_themes` (legível sem login).
 */
export async function resolveBrandTheme(input: {
  coachId?: string | null;
  profileId?: string | null;
  override?: BrandThemeKey | null;
}): Promise<BrandTheme> {
  if (input.override) return getThemeByKey(input.override);
  if (!input.coachId && !input.profileId) return FITMIND_THEME;
  const chaveCache = `ctx:${input.coachId || ""}:${input.profileId || ""}`;
  const emCache = cache.get(chaveCache);
  if (emCache) return emCache;
  try {
    const { data } = await supabase.rpc("resolver_tema_marca" as never, {
      _coach_id: input.coachId ?? null,
      _profile_id: input.profileId ?? null,
    } as never);
    const row = (Array.isArray(data) ? data[0] : data) as BrandThemeRow | null;
    const tema = row?.key ? rowToTheme(row) : FITMIND_THEME;
    cache.set(chaveCache, tema);
    if (row?.key) cache.set(row.key, tema);
    return tema;
  } catch {
    return FITMIND_THEME;
  }
}

/** Limpa o cache (após o admin salvar um tema). */
export function limparCacheTemas() {
  cache.clear();
}

// Serialização dos tokens para variáveis CSS (via style.setProperty)
export function themeToCssVars(theme: BrandTheme): Record<string, string> {
  const t = theme.tokens;
  return {
    "--background": t.background,
    "--foreground": t.foreground,
    "--card": t.card,
    "--card-foreground": t.cardForeground,
    "--popover": t.popover,
    "--popover-foreground": t.popoverForeground,
    "--primary": t.primary,
    "--primary-foreground": t.primaryForeground,
    "--secondary": t.secondary,
    "--secondary-foreground": t.secondaryForeground,
    "--muted": t.muted,
    "--muted-foreground": t.mutedForeground,
    "--accent": t.accent,
    "--accent-foreground": t.accentForeground,
    "--border": t.border,
    "--input": t.input,
    "--ring": t.ring,
    "--sidebar": t.sidebar,
    "--sidebar-foreground": t.sidebarForeground,
    "--sidebar-primary": t.sidebarPrimary,
    "--sidebar-primary-foreground": t.sidebarPrimaryForeground,
    "--sidebar-accent": t.sidebarAccent,
    "--sidebar-accent-foreground": t.sidebarAccentForeground,
    "--sidebar-border": t.sidebarBorder,
    "--sidebar-ring": t.sidebarRing,
  };
}
