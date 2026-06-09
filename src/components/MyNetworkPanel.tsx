import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Users, TrendingUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PendingInfo } from "@/components/PendingInfo";

const MIN_WITHDRAWAL = 100;

type Stats = {
  available: number;
  pending: number;
  total: number;
  directs: number;
  network: number;
  recent: Array<{ id: string; amount: number; level: number; created_at: string; from?: string | null }>;
};

type NetworkPerson = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  origin: "student" | "coach";
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MyNetworkPanel() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);

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
        setProfileId(profile.id);

        const [{ data: coach }, { data: partner }] = await Promise.all([
          supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
          supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle(),
        ]);
        setCoachId(coach?.id ?? null);
        setPartnerId((partner as { id?: string } | null)?.id ?? null);

        const [walletRes, directsRes, partnerDirectsRes, commRes] = await Promise.all([
          supabase
            .from("wallets")
            .select("available_balance,pending_balance,total_earned")
            .eq("profile_id", profile.id)
            .maybeSingle(),
          coach?.id
            ? supabase.from("students").select("id", { count: "exact", head: true }).eq("coach_id", coach.id)
            : Promise.resolve({ count: 0 } as { count: number }),
          partner
            ? supabase.from("students").select("id", { count: "exact", head: true }).eq("partner_id" as never, (partner as { id: string }).id)
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
        const directsCount = ((directsRes as { count: number }).count ?? 0) + ((partnerDirectsRes as { count: number }).count ?? 0);

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
        <Stat icon={<Wallet className="h-4 w-4" />} label="A liberar" value={brl(stats.pending)} pendingHelp />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Total recebido" value={brl(stats.total)} />

        <button onClick={() => setShowNetwork(true)} className="text-left">
          <Stat icon={<Users className="h-4 w-4" />} label="Pessoas na rede" value={`${stats.network}`} hint="Toque para ver" />
        </button>
      </div>

      <button
        onClick={() => setShowWithdraw(true)}
        disabled={stats.available <= 0}
        className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Wallet className="h-4 w-4" /> Solicitar saque PIX
      </button>

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

      {showWithdraw && profileId && (
        <WithdrawModal
          profileId={profileId}
          available={stats.available}
          onClose={() => setShowWithdraw(false)}
        />
      )}

      {showNetwork && (
        <NetworkPeopleModal
          coachId={coachId}
          partnerId={partnerId}
          onClose={() => setShowNetwork(false)}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4 w-full" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-1.5 text-[11px] text-white/50 mb-1">
        {icon} {label}
      </div>
      <p className={`text-xl font-bold ${accent ? "text-primary" : "text-white"}`}>{value}</p>
      {hint && <p className="text-[10px] text-white/40 mt-0.5">{hint}</p>}
    </div>
  );
}

function WithdrawModal({ profileId, available, onClose }: { profileId: string; available: number; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe o valor do saque");
    if (value > available) return toast.error("Valor maior que o saldo disponível");
    if (!pixKey.trim()) return toast.error("Informe sua chave PIX");
    setSaving(true);
    const { error } = await supabase.from("withdrawal_requests").insert({
      profile_id: profileId,
      amount: value,
      pix_key: pixKey.trim(),
      pix_key_type: pixKeyType,
      status: "requested",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Saque de ${brl(value)} solicitado! Aguardando aprovação.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-3" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Solicitar saque PIX</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-white/50">Disponível para saque: <b className="text-primary">{brl(available)}</b></p>
        <div>
          <label className="text-[11px] text-white/60">Valor</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="w-full mt-1 rounded bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="text-[11px] text-white/60">Tipo</label>
            <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value)} className="w-full mt-1 rounded bg-black/40 border border-white/10 px-2 py-2 text-sm text-white">
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="random">Aleatória</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-white/60">Chave PIX</label>
            <input value={pixKey} onChange={e => setPixKey(e.target.value)} className="w-full mt-1 rounded bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <button onClick={submit} disabled={saving} className="w-full rounded bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Confirmar solicitação"}
        </button>
      </div>
    </div>
  );
}

function NetworkPeopleModal({ coachId, partnerId, onClose }: { coachId: string | null; partnerId: string | null; onClose: () => void }) {
  const [people, setPeople] = useState<NetworkPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const all: NetworkPerson[] = [];
      if (coachId) {
        const { data } = await supabase
          .from("students")
          .select("id, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
          .eq("coach_id", coachId);
        ((data as unknown as Array<{ id: string; profiles: { name: string; email: string | null; phone: string | null; photo_url: string | null } | null }>) || []).forEach(s => {
          all.push({ id: s.id, name: s.profiles?.name || "—", email: s.profiles?.email ?? null, phone: s.profiles?.phone ?? null, photo_url: s.profiles?.photo_url ?? null, origin: "student" });
        });
      }
      if (partnerId) {
        const { data } = await supabase
          .from("students")
          .select("id, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
          .eq("partner_id" as never, partnerId);
        ((data as unknown as Array<{ id: string; profiles: { name: string; email: string | null; phone: string | null; photo_url: string | null } | null }>) || []).forEach(s => {
          if (!all.find(a => a.id === s.id)) {
            all.push({ id: s.id, name: s.profiles?.name || "—", email: s.profiles?.email ?? null, phone: s.profiles?.phone ?? null, photo_url: s.profiles?.photo_url ?? null, origin: "student" });
          }
        });
      }
      setPeople(all);
      setLoading(false);
    })();
  }, [coachId, partnerId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-5 space-y-3" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Pessoas na sua rede</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : people.length === 0 ? (
          <p className="text-xs text-white/50 text-center py-6">Ninguém na sua rede ainda.</p>
        ) : (
          <div className="space-y-2">
            {people.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2">
                {p.photo_url ? (
                  <img src={p.photo_url} className="h-9 w-9 rounded-full object-cover" alt={p.name} />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">{p.name[0]?.toUpperCase() || "?"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-white/40 truncate">{p.email || p.phone || ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyNetworkPanel;
