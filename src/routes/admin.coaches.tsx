import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, X, Mail, Phone, MapPin, CreditCard, Search, Ban, Unlock, ArrowRightLeft, Loader2, IdCard, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coaches")({
  component: AdminCoaches,
});

interface CoachRow {
  id: string;
  referral_code: string;
  approved_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  total_active_students: number | null;
  total_sales: number | null;
  created_at: string | null;
  card_valid_until: string | null;
  can_create_fitmind_events: boolean | null;
  profiles: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    cpf: string | null;
    status: string | null;
  } | null;
}

function AdminCoaches() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState<CoachRow | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [cardEditing, setCardEditing] = useState<CoachRow | null>(null);
  const [cardDate, setCardDate] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("coaches")
      .select("*, profiles!coaches_profile_id_fkey(id,name,email,phone,city,state,cpf,status)")
      .order("created_at", { ascending: false });
    setCoaches((data as unknown as CoachRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (coachId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: adminProfile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    const { data: updated, error } = await supabase
      .from("coaches")
      .update({ approved_at: new Date().toISOString(), approved_by: adminProfile?.id })
      .eq("id", coachId)
      .select("profile_id")
      .maybeSingle();
    if (error) { toast.error("Erro ao aprovar"); return; }
    // Cria notificação para o coach
    if (updated?.profile_id) {
      await supabase.from("notifications").insert({
        profile_id: updated.profile_id,
        type: "coach_approved",
        title: "Cadastro de coach aprovado! 🎉",
        message: "Você já pode acessar todos os recursos do painel de coach.",
        action_url: "/coach",
      });
    }
    toast.success("Coach aprovado!");
    load();
  };

  const reject = async (coachId: string) => {
    if (!confirm("Rejeitar este coach? O cadastro será removido.")) return;
    const { error } = await supabase.from("coaches").delete().eq("id", coachId);
    if (error) toast.error("Erro ao rejeitar");
    else { toast.success("Cadastro rejeitado"); load(); }
  };

  const blockCoach = async (coachId: string) => {
    if (!confirm("Bloquear este coach? Ele perderá o acesso ao painel.")) return;
    setActing(`block-${coachId}`);
    const { error } = await supabase.rpc("block_inactive_coach" as never, {
      _coach_id: coachId,
      _reason: "Bloqueado manualmente pelo administrador.",
    } as never);
    setActing(null);
    if (error) { console.error("[block]", error); toast.error(error.message || "Erro ao desativar coach"); }
    else { toast.success("Coach bloqueado"); load(); }
  };

  const unblockCoach = async (coachId: string) => {
    setActing(`unblock-${coachId}`);
    const { error } = await supabase.rpc("unblock_coach" as never, { _coach_id: coachId } as never);
    setActing(null);
    if (error) { console.error("[unblock]", error); toast.error(error.message || "Erro ao reativar coach"); }
    else { toast.success("Coach reativado"); load(); }
  };

  const openTransfer = (c: CoachRow) => {
    setTransferring(c);
    setTransferTargetId("");
    setTransferSearch("");
  };

  const confirmTransfer = async () => {
    if (!transferring || !transferTargetId) {
      toast.error("Selecione o coach destino");
      return;
    }
    setActing(`transfer-${transferring.id}`);
    const { error } = await supabase.rpc("transfer_inactive_coach_network" as never, {
      _from_coach_id: transferring.id,
      _to_coach_id: transferTargetId,
      _reason: "Migração administrativa de rede.",
    } as never);
    setActing(null);
    if (error) { console.error("[transfer]", error); toast.error(error.message || "Erro ao migrar rede"); }
    else {
      toast.success("Rede transferida");
      setTransferring(null);
      load();
    }
  };

  const openCardEditor = (c: CoachRow) => {
    setCardEditing(c);
    setCardDate(c.card_valid_until ? c.card_valid_until.slice(0, 10) : "");
  };

  const saveCard = async (validUntil: string | null) => {
    if (!cardEditing) return;
    setActing(`card-${cardEditing.id}`);
    const { error } = await supabase.rpc("admin_set_coach_card_validity" as never, {
      _coach_id: cardEditing.id,
      _valid_until: validUntil,
    } as never);
    setActing(null);
    if (error) { toast.error(error.message || "Erro ao salvar"); return; }
    toast.success(validUntil ? "Carteirinha atualizada" : "Carteirinha removida");
    setCardEditing(null);
    load();
  };

  const extendCardDays = (days: number) => {
    if (!cardEditing) return;
    const base = cardEditing.card_valid_until && new Date(cardEditing.card_valid_until) > new Date()
      ? new Date(cardEditing.card_valid_until)
      : new Date();
    base.setDate(base.getDate() + days);
    saveCard(base.toISOString());
  };

  const toggleEventCreator = async (c: CoachRow) => {
    const next = !c.can_create_fitmind_events;
    setActing(`creator-${c.id}`);
    const { error } = await supabase
      .from("coaches")
      .update({ can_create_fitmind_events: next } as never)
      .eq("id", c.id);
    setActing(null);
    if (error) { toast.error(error.message || "Erro ao atualizar"); return; }
    toast.success(next ? "Coach pode criar eventos FitMind" : "Permissão removida");
    load();
  };


  const transferTargets = useMemo(() => {
    if (!transferring) return [];
    const q = transferSearch.trim().toLowerCase();
    return coaches
      .filter((c) => c.approved_at && !c.blocked_at && c.id !== transferring.id)
      .filter((c) => !q || c.profiles?.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [coaches, transferring, transferSearch]);

  const filtered = coaches.filter((c) => {
    if (filter === "pending" && c.approved_at) return false;
    if (filter === "approved" && !c.approved_at) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.profiles?.name.toLowerCase().includes(q) ||
             c.profiles?.email.toLowerCase().includes(q) ||
             c.referral_code.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    pending: coaches.filter((c) => !c.approved_at).length,
    approved: coaches.filter((c) => c.approved_at).length,
    all: coaches.length,
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Coaches</h1>
        <p className="text-sm text-white/50">Aprovar, gerenciar e visualizar coaches da rede</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "#1A1A1A" }}>
          {(["pending", "approved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
              }`}
            >
              {f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : "Todos"} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-white/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-white/50">Nenhum coach encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-white">{c.profiles?.name}</h3>
                    {c.approved_at ? (
                      c.blocked_at ? (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                          Bloqueado
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">
                          Aprovado
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        Pendente
                      </span>
                    )}
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary">
                      {c.referral_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/60">
                    <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {c.profiles?.email}</div>
                    {c.profiles?.phone && (
                      <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {c.profiles.phone}</div>
                    )}
                    {c.profiles?.city && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> {c.profiles.city}/{c.profiles.state}
                      </div>
                    )}
                    {c.pix_key && (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" /> PIX ({c.pix_key_type}): {c.pix_key}
                      </div>
                    )}
                  </div>
                  {c.approved_at && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs">
                      <span className="text-white/50">Alunos: <span className="font-bold text-white">{c.total_active_students || 0}</span></span>
                      <span className="text-white/50">Vendas: <span className="font-bold text-white">R$ {Number(c.total_sales || 0).toLocaleString("pt-BR")}</span></span>
                      <span className="text-white/50">Carteirinha: {c.card_valid_until && new Date(c.card_valid_until) > new Date()
                        ? <span className="font-bold text-success">ativa até {new Date(c.card_valid_until).toLocaleDateString("pt-BR")}</span>
                        : <span className="font-bold text-red-400">inativa</span>}</span>
                    </div>
                  )}
                </div>

                {!c.approved_at ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(c.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => reject(c.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openCardEditor(c)}
                      className="flex items-center gap-1.5 rounded-lg bg-yellow-500/15 px-3 py-2 text-xs font-bold text-yellow-400 hover:bg-yellow-500/25"
                    >
                      <IdCard className="h-3.5 w-3.5" /> Carteirinha
                    </button>
                    <button
                      onClick={() => openTransfer(c)}
                      disabled={acting === `transfer-${c.id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-50"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Migrar rede
                    </button>
                    {c.blocked_at ? (
                      <button
                        onClick={() => unblockCoach(c.id)}
                        disabled={acting === `unblock-${c.id}`}
                        className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {acting === `unblock-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Reativar
                      </button>
                    ) : (
                      <button
                        onClick={() => blockCoach(c.id)}
                        disabled={acting === `block-${c.id}`}
                        className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {acting === `block-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Desativar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {transferring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => acting?.startsWith("transfer") ? null : setTransferring(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white">Migrar rede</h2>
                <p className="text-xs text-white/50">De: <span className="text-white">{transferring.profiles?.name}</span></p>
              </div>
              <button onClick={() => setTransferring(null)} className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-[11px] text-white/50">
              Move todos os alunos diretos e downlines imediatos para o coach selecionado.
            </p>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
                placeholder="Buscar coach destino..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
              {transferTargets.length === 0 ? (
                <p className="p-3 text-xs text-white/50">Nenhum coach disponível.</p>
              ) : (
                transferTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTransferTargetId(t.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${transferTargetId === t.id ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/5"}`}
                  >
                    {t.profiles?.name}
                    <span className="ml-2 text-[10px] opacity-60">{t.total_active_students || 0} alunos</span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setTransferring(null)}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmTransfer}
                disabled={!transferTargetId || acting === `transfer-${transferring.id}`}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {acting === `transfer-${transferring.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar migração
              </button>
            </div>
          </div>
        </div>
      )}

      {cardEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => acting?.startsWith("card") ? null : setCardEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white flex items-center gap-2"><IdCard className="h-4 w-4 text-yellow-400" /> Carteirinha do coach</h2>
                <p className="text-xs text-white/50">{cardEditing.profiles?.name}</p>
              </div>
              <button onClick={() => setCardEditing(null)} className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-[11px] text-white/50">
              Status atual: {cardEditing.card_valid_until && new Date(cardEditing.card_valid_until) > new Date()
                ? <span className="text-success font-bold">ativa até {new Date(cardEditing.card_valid_until).toLocaleDateString("pt-BR")}</span>
                : <span className="text-red-400 font-bold">inativa</span>}
            </p>

            <div className="mb-4 grid grid-cols-3 gap-2">
              <button onClick={() => extendCardDays(30)} disabled={acting === `card-${cardEditing.id}`}
                className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-[11px] font-bold text-white disabled:opacity-50">+30 dias</button>
              <button onClick={() => extendCardDays(90)} disabled={acting === `card-${cardEditing.id}`}
                className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-[11px] font-bold text-white disabled:opacity-50">+90 dias</button>
              <button onClick={() => extendCardDays(365)} disabled={acting === `card-${cardEditing.id}`}
                className="rounded-lg bg-primary hover:opacity-90 px-2 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50">+365 dias</button>
            </div>

            <label className="block text-[11px] text-white/60 mb-1">Definir data específica</label>
            <input
              type="date"
              value={cardDate}
              onChange={(e) => setCardDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => saveCard(null)}
                disabled={acting === `card-${cardEditing.id}`}
                className="flex-1 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                Remover carteirinha
              </button>
              <button
                onClick={() => saveCard(cardDate ? new Date(cardDate + "T23:59:59").toISOString() : null)}
                disabled={!cardDate || acting === `card-${cardEditing.id}`}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {acting === `card-${cardEditing.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar data
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
