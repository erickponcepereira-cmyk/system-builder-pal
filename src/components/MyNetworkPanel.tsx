import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Users, TrendingUp, Loader2 } from "lucide-react";

type Stats = {
  available: number;
  pending: number;
  total: number;
  directs: number;
  network: number;
  recent: Array<{ id: string; amount: number; level: number; created_at: string; from?: string | null }>;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Simple "Minha Rede" panel for partners and professionals.
 * Shows what they have already received and who is on their network.
 */
export function MyNetworkPanel() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (!profile) return;

        const { data: coach } = await supabase
          .from("coaches")
          .select("id")
          .eq("profile_id", profile.id)
          .maybeSingle();

        const [walletRes, directsRes, commRes] = await Promise.all([
          supabase
            .from("wallets")
            .select("available_balance,pending_balance,total_earned")
            .eq("profile_id", profile.id)
            .maybeSingle(),
          coach?.id
            ? supabase
                .from("students")
                .select("id", { count: "exact", head: true })
                .eq("coach_id", coach.id)
            : Promise.resolve({ count: 0 } as { count: number }),
          supabase
            .from("commissions")
            .select("id, amount, level, created_at")
            .eq("beneficiary_profile_id", profile.id)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);

        if (cancelled) return;

        const w = (walletRes.data as { available_balance?: number; pending_balance?: number; total_earned?: number } | null) || {};
        const directsCount = (directsRes as { count: number }).count ?? 0;

        setStats({
          available: Number(w.available_balance ?? 0),
          pending: Number(w.pending_balance ?? 0),
          total: Number(w.total_earned ?? 0),
          directs: directsCount,
          network: directsCount,
          recent: ((commRes.data as Array<{ id: string; amount: number; level: number; created_at: string }>) || []).map((r) => ({
            id: r.id,
            amount: Number(r.amount),
            level: r.level,
            created_at: r.created_at,
          })),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl p-6 text-sm text-white/60" style={{ backgroundColor: "#1A1A1A" }}>
        Não conseguimos carregar os dados da sua rede agora.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Disponível" value={brl(stats.available)} accent />
        <Stat icon={<Wallet className="h-4 w-4" />} label="A liberar" value={brl(stats.pending)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Total recebido" value={brl(stats.total)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Pessoas na rede" value={`${stats.network}`} hint={`${stats.directs} diretos`} />
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Comissões recebidas</h3>
        {stats.recent.length === 0 ? (
          <p className="text-xs text-white/50">Nenhuma comissão ainda. Quando alguém da sua rede comprar, aparece aqui.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {stats.recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-white">{brl(c.amount)}</p>
                  <p className="text-[11px] text-white/40">
                    Nível {c.level} · {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-primary/80">Rede MLM</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-1.5 text-[11px] text-white/50 mb-1">
        {icon} {label}
      </div>
      <p className={`text-xl font-bold ${accent ? "text-primary" : "text-white"}`}>{value}</p>
      {hint && <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>}
    </div>
  );
}

export default MyNetworkPanel;
