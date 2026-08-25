import { supabase } from "@/integrations/supabase/client";

export type Permissao =
  | "overview.ver"
  | "products.editar"
  | "freebies.editar"
  | "scanner.usar"
  | "wallet.ver"
  | "orders.ver"
  | "timeline.editar"
  | "reports.ver"
  | "members.gerenciar"
  | "profile.editar"
  | "agenda.ver"
  | "collab.ver"
  | "network.ver"
  | "store.ver"
  | "subscription.ver"
  | "crm"
  | "robo";

export const PERMISSOES: Permissao[] = [
  "overview.ver",
  "products.editar",
  "freebies.editar",
  "scanner.usar",
  "wallet.ver",
  "orders.ver",
  "timeline.editar",
  "reports.ver",
  "members.gerenciar",
  "profile.editar",
  "agenda.ver",
  "collab.ver",
  "network.ver",
  "store.ver",
  "subscription.ver",
  "crm",
  "robo",
];

export const ROTULOS_PERMISSAO: Record<Permissao, string> = {
  "overview.ver": "Ver início da unidade",
  "products.editar": "Criar e editar produtos",
  "freebies.editar": "Gerenciar gratuitos e horários",
  "scanner.usar": "Usar o leitor de QR / check-in",
  "wallet.ver": "Ver a carteira da unidade",
  "orders.ver": "Ver pedidos e vendas",
  "timeline.editar": "Publicar na timeline",
  "reports.ver": "Ver relatórios",
  "members.gerenciar": "Gerenciar membros e permissões",
  "profile.editar": "Editar dados da unidade",
  "agenda.ver": "Ver a agenda FitMind",
  "collab.ver": "Ver colaborações e co-produção",
  "network.ver": "Ver a rede",
  "store.ver": "Ver a loja",
  "subscription.ver": "Ver mensalidade e anuidade",
  "crm": "Usar o CRM da unidade",
  "robo": "Usar o robô de atendimento",
};

export type PapelUnidade = "owner" | "manager" | "staff";

export interface Unidade {
  partnerId: string;
  fantasyName: string;
  city: string | null;
  state: string | null;
  photoUrl: string | null;
  status: string;
  papel: PapelUnidade;
  permissoes: Permissao[];
  /** A unidade tem controle de acesso montado — ou seja, é uma academia. */
  temAcademia: boolean;
}

const CHAVE_LS = "fitmind_unidade_parceiro";

type LinhaRpc = {
  partner_id: string;
  fantasy_name: string | null;
  city: string | null;
  state: string | null;
  photo_url: string | null;
  status: string | null;
  papel: string | null;
  permissoes: string[] | null;
  tem_academia: boolean | null;
};

/**
 * Lista as unidades de parceiro do perfil informado.
 * Usa a RPC `minhas_unidades_parceiro`; se ela ainda não existir no banco,
 * cai para a consulta direta em `partners` devolvendo a unidade como dono.
 */
export async function carregarUnidades(perfilId: string): Promise<Unidade[]> {
  try {
    const { data, error } = await supabase.rpc("minhas_unidades_parceiro" as never);
    if (error) throw error;
    const linhas = (data as unknown as LinhaRpc[]) || [];
    if (linhas.length > 0) {
      return linhas.map((l) => ({
        partnerId: l.partner_id,
        fantasyName: l.fantasy_name || "Unidade",
        city: l.city,
        state: l.state,
        photoUrl: l.photo_url,
        status: l.status || "pending",
        papel: (l.papel as PapelUnidade) || "staff",
        permissoes: (l.permissoes || []) as Permissao[],
        temAcademia: Boolean(l.tem_academia),
      }));
    }
  } catch {
    /* fallback abaixo */
  }

  const { data } = await supabase
    .from("partners" as never)
    .select("id, fantasy_name, city, state, photo_url, status" as never)
    .eq("profile_id" as never, perfilId as never);

  const linhas = (data as unknown as Array<{
    id: string;
    fantasy_name: string | null;
    city: string | null;
    state: string | null;
    photo_url: string | null;
    status: string | null;
  }>) || [];

  return linhas.map((p) => ({
    partnerId: p.id,
    fantasyName: p.fantasy_name || "Unidade",
    city: p.city,
    state: p.state,
    photoUrl: p.photo_url,
    status: p.status || "pending",
    papel: "owner" as PapelUnidade,
    permissoes: [...PERMISSOES],
    // O caminho de emergência não sabe dizer se há academia. Esconder é melhor
    // do que abrir um painel que não vai carregar.
    temAcademia: false,
  }));
}

/** Dono tem tudo liberado; demais dependem da allowlist. */
export function pode(unidade: Unidade | null | undefined, permissao: Permissao): boolean {
  if (!unidade) return false;
  if (unidade.papel === "owner") return true;
  return unidade.permissoes.includes(permissao);
}

export function lembrarUnidadeAtiva(partnerId: string) {
  try {
    localStorage.setItem(CHAVE_LS, partnerId);
  } catch {
    /* storage indisponível */
  }
}

export function unidadeLembrada(): string | null {
  try {
    return localStorage.getItem(CHAVE_LS);
  } catch {
    return null;
  }
}

export function escolherUnidadeAtiva(unidades: Unidade[], lembrada?: string | null): Unidade | null {
  if (unidades.length === 0) return null;
  const alvo = lembrada ?? unidadeLembrada();
  return unidades.find((u) => u.partnerId === alvo) || unidades[0];
}
