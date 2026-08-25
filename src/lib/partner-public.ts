import { supabase } from "@/integrations/supabase/client";

export type PublicPartner = {
  id: string;
  fantasy_name: string;
  photo_url: string | null;
  city: string | null;
  state: string | null;
  status: string;
  address: string | null;
  business_area?: string | null;
  whatsapp?: string | null;
  public_whatsapp?: string | null;
};

/**
 * A tabela `partners` nao tem SELECT liberado para anon/authenticated
 * (endurecimento de seguranca), entao qualquer embed `partners(...)` no
 * PostgREST falha com "permission denied for table partners".
 * O caminho autorizado e a RPC `parceiro_publico`.
 */
export async function loadPartnersById(ids: string[]): Promise<Map<string, PublicPartner>> {
  const map = new Map<string, PublicPartner>();
  if (ids.length === 0) return map;

  // Uma chamada para todos. Com 41 parceiros, a versao anterior fazia 41 idas
  // ao servidor para montar uma tela so.
  const { data, error } = await supabase.rpc("parceiros_publicos" as never, { _ids: ids } as never);

  if (!error) {
    for (const row of ((data as unknown as PublicPartner[]) || [])) {
      if (row?.id) map.set(row.id, row);
    }
    return map;
  }

  // A versao em lote pode nao existir ainda neste ambiente. Nesse caso volta
  // ao caminho de um por vez, que continua correto — so mais lento. Errar aqui
  // esvaziaria a tela, e foi exatamente isso que causou o incidente.
  if (!/PGRST202|schema cache|does not exist/i.test(error.message || "")) {
    console.error("[parceiros_publicos]", error);
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      const { data: uma, error: erroUm } = await supabase.rpc("parceiro_publico" as never, { p_partner_id: id } as never);
      if (erroUm) {
        console.error("[parceiro_publico]", id, erroUm);
        return null;
      }
      const rows = uma as unknown as PublicPartner[] | null;
      return rows && rows.length > 0 ? rows[0] : null;
    }),
  );
  for (const row of results) {
    if (row) map.set(row.id, row);
  }
  return map;
}
