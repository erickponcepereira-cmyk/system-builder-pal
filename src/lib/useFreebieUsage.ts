import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FreebieUsage = { week: number; month: number };
export type FreebieUsageMap = Map<string, FreebieUsage>;

/**
 * Quantos resgates o usuário logado já usou de cada benefício gratuito
 * na semana e no mês correntes (reservas + cupons de parceiro/profissional).
 */
export function useFreebieUsage() {
  const query = useQuery({
    queryKey: ["freebie-usage"],
    staleTime: 30_000,
    queryFn: async (): Promise<FreebieUsageMap> => {
      const { data, error } = await supabase.rpc("my_freebie_usage" as never);
      if (error) {
        console.error("[useFreebieUsage]", error);
        return new Map();
      }
      const rows = (data as unknown as Array<{ product_id: string; used_week: number; used_month: number }>) || [];
      const map: FreebieUsageMap = new Map();
      for (const r of rows) {
        map.set(r.product_id, { week: Number(r.used_week || 0), month: Number(r.used_month || 0) });
      }
      return map;
    },
  });

  return {
    usage: query.data ?? (new Map() as FreebieUsageMap),
    refetchUsage: query.refetch,
  };
}
