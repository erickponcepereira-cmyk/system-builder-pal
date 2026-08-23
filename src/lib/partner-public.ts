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
  const results = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc("parceiro_publico" as never, { p_partner_id: id } as never);
      if (error) {
        console.error("[parceiro_publico]", id, error);
        return null;
      }
      const rows = data as unknown as PublicPartner[] | null;
      return rows && rows.length > 0 ? rows[0] : null;
    }),
  );
  for (const row of results) {
    if (row) map.set(row.id, row);
  }
  return map;
}
