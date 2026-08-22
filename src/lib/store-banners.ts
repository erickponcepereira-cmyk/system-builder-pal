import { supabase } from "@/integrations/supabase/client";

/**
 * Banners e popup da loja.
 *
 * Cadastrados no admin. Se não houver nenhum ativo, a loja volta a derivar a
 * faixa do próprio catálogo — o comportamento anterior continua como rede de
 * segurança, para o topo da loja nunca ficar vazio.
 */

export type BannerKind = "banner" | "popup";

export type StoreBanner = {
  id: string;
  kind: BannerKind;
  title: string;
  subtitle: string | null;
  badge: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sortOrder: number;
};

export async function loadBanners(): Promise<StoreBanner[]> {
  const { data, error } = await supabase
    .from("store_banners" as never)
    .select("id,kind,title,subtitle,badge,image_url,link_url,link_label,sort_order" as never)
    .order("sort_order" as never);

  if (error) {
    // Falha aberta: sem banner a loja segue normalmente.
    console.error("[store-banners]", error);
    return [];
  }

  return ((data as unknown as Array<Record<string, unknown>>) || []).map((b) => ({
    id: String(b.id),
    kind: (String(b.kind || "banner") as BannerKind),
    title: String(b.title || ""),
    subtitle: (b.subtitle as string) || null,
    badge: (b.badge as string) || null,
    imageUrl: (b.image_url as string) || null,
    linkUrl: (b.link_url as string) || null,
    linkLabel: (b.link_label as string) || null,
    sortOrder: Number(b.sort_order || 0),
  }));
}

const CHAVE_GIRO = "fitmind_banner_giro";

/**
 * Em qual banner a faixa começa nesta visita.
 *
 * Pedido do Erick: quem entra de novo deve ver outro banner primeiro, para
 * conhecer todos com o tempo. Um contador local basta — não vale gastar
 * escrita no banco para isto, e se o navegador limpar, começar do zero é
 * inofensivo.
 */
export function proximoGiro(total: number): number {
  if (total <= 1) return 0;
  try {
    const atual = Number(window.localStorage.getItem(CHAVE_GIRO) || "0");
    const proximo = (atual + 1) % total;
    window.localStorage.setItem(CHAVE_GIRO, String(proximo));
    return proximo;
  } catch {
    return 0;
  }
}

const CHAVE_POPUP = "fitmind_popup_visto";

/** Popups já vistos. Um popup que volta toda sessão treina a fechar sem ler. */
export function popupJaVisto(id: string): boolean {
  try {
    const bruto = window.localStorage.getItem(CHAVE_POPUP);
    const lista: string[] = bruto ? JSON.parse(bruto) : [];
    return lista.includes(id);
  } catch {
    return false;
  }
}

export function marcarPopupVisto(id: string): void {
  try {
    const bruto = window.localStorage.getItem(CHAVE_POPUP);
    const lista: string[] = bruto ? JSON.parse(bruto) : [];
    if (!lista.includes(id)) lista.push(id);
    window.localStorage.setItem(CHAVE_POPUP, JSON.stringify(lista.slice(-50)));
  } catch {
    /* sem storage: o popup reaparece, e tudo bem */
  }
}

/** Primeiro popup ativo que a pessoa ainda não viu. */
export function popupPendente(banners: StoreBanner[]): StoreBanner | null {
  return banners.find((b) => b.kind === "popup" && !popupJaVisto(b.id)) ?? null;
}
