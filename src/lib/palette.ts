// Motor de paleta do white label.
//
// A ideia: o admin escolhe modo (claro/escuro) e 2–3 cores da marca; aqui
// derivamos as 25 variáveis do tema garantindo contraste de leitura real
// (WCAG AA), em vez de deixar o rosa-sobre-rosa que ninguém enxerga.

export type ModoTema = "light" | "dark";

/* ---------- conversões ---------- */

export function normalizeHex(hex: string): string {
  let h = (hex || "").trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : "#000000";
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/* ---------- contraste ---------- */

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Texto claro ou escuro — o que ler melhor sobre o fundo dado. */
export function bestForeground(fundo: string, claro = "#FFFFFF", escuro = "#111111"): string {
  return contrastRatio(fundo, claro) >= contrastRatio(fundo, escuro) ? claro : escuro;
}

/** Empurra a cor para claro/escuro até bater o contraste mínimo sobre o fundo. */
export function ensureContrast(cor: string, fundo: string, minimo: number): string {
  if (contrastRatio(cor, fundo) >= minimo) return normalizeHex(cor);
  const { h, s } = hexToHsl(cor);
  const fundoClaro = relativeLuminance(fundo) > 0.4;
  let melhor = normalizeHex(cor);
  let melhorRazao = contrastRatio(cor, fundo);
  for (let passo = 1; passo <= 100; passo++) {
    const l = fundoClaro ? Math.max(0, hexToHsl(cor).l - passo) : Math.min(100, hexToHsl(cor).l + passo);
    const tentativa = hslToHex(h, s, l);
    const razao = contrastRatio(tentativa, fundo);
    if (razao > melhorRazao) { melhor = tentativa; melhorRazao = razao; }
    if (razao >= minimo) return tentativa;
  }
  return melhor;
}

/* ---------- geração da paleta ---------- */

export interface TokensTema {
  theme_color: string;
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

export interface EntradaPaleta {
  mode: ModoTema;
  primaria: string;
  apoio?: string | null;
  destaque?: string | null;
}

/**
 * Deriva as 25 variáveis a partir de 1 a 3 cores. As superfícies mantêm o
 * matiz da marca, mas com luminosidade travada em faixas que garantem
 * separação visível entre fundo, cartão e neutro.
 */
export function gerarPaleta({ mode, primaria, apoio, destaque }: EntradaPaleta): TokensTema {
  const p = hexToHsl(primaria);
  const a = apoio ? hexToHsl(apoio) : null;
  const d = destaque ? hexToHsl(destaque) : null;

  // saturação suave nas superfícies: a marca aparece sem lavar o texto
  const satSuperficie = Math.min(mode === "light" ? 40 : 22, Math.max(6, p.s * 0.35));
  const matizSuperficie = (a ?? p).h;

  const claro = mode === "light";

  const background = hslToHex(matizSuperficie, satSuperficie, claro ? 95 : 7);
  const card = hslToHex(matizSuperficie, satSuperficie * 0.55, claro ? 100 : 11);
  const popover = card;
  const muted = hslToHex(matizSuperficie, satSuperficie * 0.8, claro ? 90 : 15);
  const input = hslToHex(matizSuperficie, satSuperficie * 0.7, claro ? 92 : 14);
  const border = hslToHex(matizSuperficie, satSuperficie, claro ? 80 : 24);
  const sidebar = hslToHex(matizSuperficie, satSuperficie, claro ? 93 : 5);
  const sidebarBorder = hslToHex(matizSuperficie, satSuperficie, claro ? 82 : 22);

  const textoBase = claro
    ? hslToHex(matizSuperficie, Math.min(45, p.s * 0.5), 14)
    : hslToHex(matizSuperficie, Math.min(20, p.s * 0.25), 97);

  const foreground = ensureContrast(textoBase, background, 4.5);
  const cardForeground = ensureContrast(textoBase, card, 4.5);
  const mutedForeground = ensureContrast(
    hslToHex(matizSuperficie, Math.min(30, p.s * 0.4), claro ? 38 : 72),
    background,
    4.5,
  );

  // a primária precisa ser vista sobre o fundo, mas sem perder a identidade
  const primary = ensureContrast(normalizeHex(primaria), background, claro ? 3 : 2.5);
  const primaryForeground = bestForeground(primary);

  const secondary = a
    ? hslToHex(a.h, Math.min(a.s, claro ? 45 : 30), claro ? 90 : 18)
    : hslToHex(p.h, satSuperficie, claro ? 90 : 18);
  const secondaryForeground = ensureContrast(textoBase, secondary, 4.5);

  const baseAccent = d ?? a ?? p;
  const accent = hslToHex(baseAccent.h, Math.min(baseAccent.s, claro ? 60 : 45), claro ? 88 : 20);
  const accentForeground = ensureContrast(
    hslToHex(baseAccent.h, Math.min(80, baseAccent.s), claro ? 25 : 82),
    accent,
    4.5,
  );

  const ring = d ? ensureContrast(normalizeHex(destaque as string), background, 2.5) : primary;

  return {
    theme_color: background,
    background,
    foreground,
    card,
    card_foreground: cardForeground,
    popover,
    popover_foreground: cardForeground,
    primary_color: primary,
    primary_foreground: primaryForeground,
    secondary,
    secondary_foreground: secondaryForeground,
    muted,
    muted_foreground: mutedForeground,
    accent,
    accent_foreground: accentForeground,
    border,
    input,
    ring,
    sidebar,
    sidebar_foreground: ensureContrast(textoBase, sidebar, 4.5),
    sidebar_primary: primary,
    sidebar_primary_foreground: primaryForeground,
    sidebar_accent: muted,
    sidebar_accent_foreground: ensureContrast(textoBase, muted, 4.5),
    sidebar_border: sidebarBorder,
    sidebar_ring: ring,
  };
}

/* ---------- auditoria ---------- */

export interface ParContraste {
  id: keyof TokensTema;
  label: string;
  frente: string;
  fundo: string;
  razao: number;
  minimo: number;
  ok: boolean;
}

const PARES: Array<{ id: keyof TokensTema; label: string; frente: keyof TokensTema; fundo: keyof TokensTema; minimo: number }> = [
  { id: "foreground", label: "Texto sobre o fundo", frente: "foreground", fundo: "background", minimo: 4.5 },
  { id: "card_foreground", label: "Texto do cartão", frente: "card_foreground", fundo: "card", minimo: 4.5 },
  { id: "muted_foreground", label: "Texto neutro", frente: "muted_foreground", fundo: "background", minimo: 4.5 },
  { id: "primary_foreground", label: "Texto do botão principal", frente: "primary_foreground", fundo: "primary_color", minimo: 4.5 },
  { id: "secondary_foreground", label: "Texto secundário", frente: "secondary_foreground", fundo: "secondary", minimo: 4.5 },
  { id: "accent_foreground", label: "Texto do destaque", frente: "accent_foreground", fundo: "accent", minimo: 4.5 },
  { id: "card", label: "Cartão x fundo", frente: "card", fundo: "background", minimo: 1.12 },
  { id: "border", label: "Borda x fundo", frente: "border", fundo: "background", minimo: 1.5 },
  { id: "primary_color", label: "Cor principal x fundo", frente: "primary_color", fundo: "background", minimo: 2.5 },
  { id: "sidebar_foreground", label: "Texto do menu", frente: "sidebar_foreground", fundo: "sidebar", minimo: 4.5 },
];

export function auditarContraste(t: Partial<TokensTema>): ParContraste[] {
  return PARES.filter((p) => t[p.frente] && t[p.fundo]).map((p) => {
    const frente = normalizeHex(t[p.frente] as string);
    const fundo = normalizeHex(t[p.fundo] as string);
    const razao = contrastRatio(frente, fundo);
    return { id: p.id, label: p.label, frente, fundo, razao, minimo: p.minimo, ok: razao >= p.minimo };
  });
}

/** Corrige apenas os tokens reprovados, preservando o resto do tema. */
export function corrigirContraste<T extends Partial<TokensTema>>(tema: T): T {
  const out: Record<string, unknown> = { ...tema };
  for (const p of PARES) {
    const frente = tema[p.frente] as string | undefined;
    const fundo = tema[p.fundo] as string | undefined;
    if (!frente || !fundo) continue;
    if (contrastRatio(frente, fundo) >= p.minimo) continue;
    // superfícies: separa clareando/escurecendo; textos: joga para o extremo legível
    if (p.frente === "card" || p.frente === "border" || p.frente === "primary_color") {
      out[p.frente] = ensureContrast(frente, fundo, p.minimo);
    } else {
      out[p.frente] = ensureContrast(bestForeground(fundo, "#FFFFFF", "#111111"), fundo, p.minimo);
    }
  }
  return out as T;
}
