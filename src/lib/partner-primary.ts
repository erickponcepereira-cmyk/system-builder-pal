/**
 * Um mesmo login pode ser dono de várias unidades (filiais) de parceiro.
 * Consultas antigas usavam `.eq("profile_id", x).maybeSingle()`, que passa a
 * devolver ERRO quando existe mais de uma unidade — e o sistema concluía que
 * o usuário não era parceiro (painel some).
 *
 * Regra única: a "unidade principal" é a aprovada mais antiga; se nenhuma
 * estiver aprovada, a mais antiga criada.
 */

type AnyClient = {
  from: (table: string) => any;
};

export type PartnerRow = { id: string; status?: string | null; created_at?: string | null; [k: string]: unknown };

export function pickPrimaryPartner<T extends PartnerRow>(rows: T[] | null | undefined): T | null {
  const list = rows ?? [];
  if (list.length === 0) return null;
  const byDate = [...list].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return byDate.find((r) => r.status === "approved") ?? byDate[0] ?? null;
}

/**
 * Busca a unidade principal do perfil. `columns` deve incluir os campos que
 * você precisa; `status` e `created_at` são adicionados automaticamente.
 */
export async function fetchPrimaryPartner<T extends PartnerRow = PartnerRow>(
  client: AnyClient,
  profileId: string,
  columns = "id",
): Promise<T | null> {
  const cols = Array.from(new Set([...columns.split(",").map((c) => c.trim()).filter(Boolean), "status", "created_at"])).join(",");
  const { data } = await client.from("partners").select(cols).eq("profile_id", profileId);
  return pickPrimaryPartner((data as T[]) || null);
}

/** Lista todas as unidades do perfil (ordenadas: principal primeiro). */
export async function fetchAllPartners<T extends PartnerRow = PartnerRow>(
  client: AnyClient,
  profileId: string,
  columns = "id",
): Promise<T[]> {
  const cols = Array.from(new Set([...columns.split(",").map((c) => c.trim()).filter(Boolean), "status", "created_at"])).join(",");
  const { data } = await client.from("partners").select(cols).eq("profile_id", profileId);
  const list = ((data as T[]) || []);
  const primary = pickPrimaryPartner(list);
  return primary ? [primary, ...list.filter((r) => r.id !== primary.id)] : list;
}
