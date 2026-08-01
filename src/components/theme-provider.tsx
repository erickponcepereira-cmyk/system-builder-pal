import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BrandTheme,
  BrandThemeKey,
  FITMIND_THEME,
  getThemeByKey,
  resolveBrandTheme,
  themeToCssVars,
} from "@/lib/branding";
import { supabase } from "@/integrations/supabase/client";

type BrandingContextValue = {
  theme: BrandTheme;
  setOverride: (key: BrandThemeKey | null) => void;
  clearOverride: () => void;
};

const BrandingContext = createContext<BrandingContextValue>({
  theme: FITMIND_THEME,
  setOverride: () => {},
  clearOverride: () => {},
});

const OVERRIDE_KEY = "fitmind_branding_override";

function readOverride(): BrandThemeKey | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    if (v) return v;
  } catch { /* ignore */ }
  return null;
}

function readReferralCoachId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const referral = sessionStorage.getItem("fitmind_referral");
    if (!referral) return null;
    const parsed = JSON.parse(referral) as { coachId?: string | null };
    return parsed?.coachId ?? null;
  } catch { return null; }
}

function applyThemeToDocument(theme: BrandTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = themeToCssVars(theme);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  // Modo dark/light — mantém classe .dark para compatibilidade com dark: utilities
  root.classList.remove("light", "dark");
  root.classList.add(theme.mode);
  root.dataset.theme = theme.key;

  // Meta theme-color
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = theme.themeColor;

  // Favicon
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  links.forEach((l) => { l.href = theme.faviconUrl; });

  // Cor de fundo do body/html (evita flash)
  document.documentElement.style.backgroundColor = theme.tokens.background;
  document.body.style.backgroundColor = theme.tokens.background;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverrideState] = useState<BrandThemeKey | null>(() => readOverride());
  const [coachId, setCoachId] = useState<string | null>(() => readReferralCoachId());
  const [profileId, setProfileId] = useState<string | null>(null);
  const lastUserId = useRef<string | null>(null);

  const loadSessionContext = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        lastUserId.current = null;
        setProfileId(null);
        setCoachId(null);
        return;
      }
      if (lastUserId.current === user.id) return;
      lastUserId.current = user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      const pid = (profile as { id?: string } | null)?.id ?? null;
      setProfileId(pid);

      if (!pid) { setCoachId(null); return; }

      // Se for aluno, buscar coach_id
      const { data: student } = await supabase
        .from("students")
        .select("coach_id")
        .eq("profile_id", pid)
        .maybeSingle();
      const cid = (student as { coach_id?: string | null } | null)?.coach_id ?? null;
      setCoachId(cid);
    } catch (err) {
      console.warn("[branding] falha ao carregar contexto de tema:", err);
    }
  }, []);

  useEffect(() => {
    loadSessionContext();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        lastUserId.current = null;
        loadSessionContext();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadSessionContext]);

  // Reagir a mudanças no sessionStorage (mesmo tab) — outros componentes podem chamar setOverride
  useEffect(() => {
    const handler = () => setOverrideState(readOverride());
    window.addEventListener("storage", handler);
    window.addEventListener("fitmind:branding-changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("fitmind:branding-changed", handler);
    };
  }, []);

  const [theme, setTheme] = useState<BrandTheme>(FITMIND_THEME);

  useEffect(() => {
    let ativo = true;
    resolveBrandTheme({ coachId, profileId, override })
      .then((t) => { if (ativo) setTheme(t); })
      .catch(() => { if (ativo) setTheme(FITMIND_THEME); });
    return () => { ativo = false; };
  }, [coachId, profileId, override]);

  useEffect(() => { applyThemeToDocument(theme); }, [theme]);

  const setOverride = useCallback((key: BrandThemeKey | null) => {
    try {
      if (key) sessionStorage.setItem(OVERRIDE_KEY, key);
      else sessionStorage.removeItem(OVERRIDE_KEY);
    } catch { /* ignore */ }
    setOverrideState(key);
    window.dispatchEvent(new Event("fitmind:branding-changed"));
  }, []);

  const clearOverride = useCallback(() => setOverride(null), [setOverride]);

  const value = useMemo<BrandingContextValue>(
    () => ({ theme, setOverride, clearOverride }),
    [theme, setOverride, clearOverride],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}

// Compat com código existente que importava useTheme
export function useTheme() {
  const { theme } = useBranding();
  return { theme: theme.mode, setTheme: () => {}, toggle: () => {} };
}

export { getThemeByKey };
