import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MinhaRede } from "@/components/coach/MinhaRede";
import { RankingTable } from "@/components/coach/RankingTable";

export function NetworkTab({ referralLink: _referralLink, onCopy: _onCopy }: { referralLink: string; onCopy: () => void }) {
  const [loading, setLoading] = useState(true);
  const [directs, setDirects] = useState(0);
  const [network, setNetwork] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (!profile?.id) return;
        const { data: coach } = await supabase
          .from("coaches")
          .select("id")
          .eq("profile_id", profile.id)
          .maybeSingle();
        if (!coach?.id) return;

        // Alunos diretos
        const { count: directCount } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", coach.id);

        // Coaches downline (até 3 níveis)
        let allCoachIds = [coach.id];
        let frontier = [coach.id];
        for (let lvl = 0; lvl < 3 && frontier.length > 0; lvl++) {
          const { data: children } = await supabase
            .from("coaches")
            .select("id")
            .in("upline_coach_id", frontier);
          const ids = (children || []).map((c: any) => c.id);
          if (ids.length === 0) break;
          allCoachIds = allCoachIds.concat(ids);
          frontier = ids;
        }

        // Rede total = todos os alunos dos coaches (eu + downline 3 níveis)
        const { count: networkCount } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .in("coach_id", allCoachIds);

        if (cancelled) return;
        setDirects(directCount ?? 0);
        setNetwork(networkCount ?? 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Minha Rede</h1>
        <p className="text-sm text-white/50">Acompanhe sua rede MLM e simule ganhos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Alunos diretos</p>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          ) : (
            <p className="text-3xl font-bold text-white">{directs}</p>
          )}
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Rede total (3 níveis)</p>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          ) : (
            <p className="text-3xl font-bold text-white">{network}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <MinhaRede />
      </div>

      <div className="mt-4">
        <RankingTable />
      </div>
    </>
  );
}

export default NetworkTab;
