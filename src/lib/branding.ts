// White label / branding dinâmico
// Um único sistema FitMind com temas visuais aplicáveis por contexto de coach.

import fitmindIcon from "@/assets/fitmind-icon.png.asset.json";
import fitmindSplash from "@/assets/fitmind-splash.png.asset.json";
import carolLogo from "@/assets/carol-aventureira-logo.png.asset.json";

export type BrandThemeKey = "fitmind" | "carol";

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

// ID do coach da Carol (profiles/coaches). Confirmado no banco.
export const CAROL_COACH_ID = "bf7efe5a-e408-4447-8581-f6498d18cb26";
export const CAROL_PROFILE_ID = "9e8b86c3-1e8b-4b73-a77d-6aee1f430ac5";

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

export const CAROL_THEME: BrandTheme = {
  key: "carol",
  name: "Carol Aventureira",
  mode: "light",
  logoFull: carolLogo.url,
  logoIcon: carolLogo.url,
  faviconUrl: carolLogo.url,
  themeColor: "#FFC1D8",
  tokens: {
    background: "#FFC1D8",
    foreground: "#3A1028",
    card: "#FFE8F0",
    cardForeground: "#3A1028",
    popover: "#FFE8F0",
    popoverForeground: "#3A1028",
    primary: "#F53687",
    primaryForeground: "#FFFFFF",
    secondary: "#FFD6E5",
    secondaryForeground: "#3A1028",
    muted: "#FFE3EC",
    mutedForeground: "#6E3854",
    accent: "#FFB6D1",
    accentForeground: "#3A1028",
    border: "#D978A2",
    input: "#FFF4F8",
    ring: "#F53687",
    sidebar: "#FFD1E1",
    sidebarForeground: "#3A1028",
    sidebarPrimary: "#F53687",
    sidebarPrimaryForeground: "#FFFFFF",
    sidebarAccent: "#FFE3EC",
    sidebarAccentForeground: "#3A1028",
    sidebarBorder: "#D978A2",
    sidebarRing: "#F53687",
  },
};

export const THEMES: Record<BrandThemeKey, BrandTheme> = {
  fitmind: FITMIND_THEME,
  carol: CAROL_THEME,
};

export function getThemeByKey(key: BrandThemeKey | null | undefined): BrandTheme {
  if (key && THEMES[key]) return THEMES[key];
  return FITMIND_THEME;
}

/**
 * Resolve o tema a partir do contexto disponível:
 * - coachId do aluno
 * - profileId do usuário logado (Carol logando na própria conta)
 * - override manual (ex.: cadastro por indicação antes de haver sessão)
 */
export function resolveBrandTheme(input: {
  coachId?: string | null;
  profileId?: string | null;
  override?: BrandThemeKey | null;
}): BrandTheme {
  if (input.override) return getThemeByKey(input.override);
  if (input.coachId && input.coachId === CAROL_COACH_ID) return CAROL_THEME;
  if (input.profileId && input.profileId === CAROL_PROFILE_ID) return CAROL_THEME;
  return FITMIND_THEME;
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
