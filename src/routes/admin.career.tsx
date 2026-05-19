import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, Gift, Plus, Save, Trash2, X, Loader2, Award, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listCoachesWithBadges,
  assignBadge,
  revokeBadge,
  BADGE_KEYS,
  type BadgeKey,
} from "@/lib/coach-badges.functions";

export const Route = createFileRoute("/admin/career")({
  head: () => ({ meta: [{ title: "Carreira — Admin" }] }),
  component: AdminCareerPage,
});

type Tab = "challenges" | "redeem" | "badges";

function AdminCareerPage() {
  const [tab, setTab] = useState<Tab>("challenges");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Carreira</h1>
        <p className="text-xs text-white/50">Desafios, loja de pontos e medalhas dos coaches.</p>
      </div>
      <div className="flex gap-2 border-b border-white/10">
        <TabBtn active={tab === "challenges"} onClick={() => setTab("challenges")} icon={Trophy} label="Desafios" />
        <TabBtn active={tab === "redeem"} onClick={() => setTab("redeem")} icon={Gift} label="Loja de pontos" />
        <TabBtn active={tab === "badges"} onClick={() => setTab("badges")} icon={Award} label="Medalhas" />
      </div>
      {tab === "challenges" ? <ChallengesTab /> : tab === "redeem" ? <RedeemTab /> : <BadgesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Trophy; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition ${
        active ? "border-[#E24B4A] text-white" : "border-transparent text-white/50 hover:text-white"
      }`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

const BADGE_META: Record<BadgeKey, { label: string; color: string; description: string }> = {
  master_coach: { label: "Master Coach", color: "bg-amber-500/20 text-amber-300 border-amber-500/40", description: "Recebe 10% de comissão cruzada em vendas autorizadas" },
  coach_hbl_42: { label: "Coach HBL 42%", color: "bg-blue-500/20 text-blue-300 border-blue-500/40", description: "Acesso aos produtos HBL com margem 42%" },
  coach_hbl_50: { label: "Coach HBL 50%", color: "bg-violet-500/20 text-violet-300 border-violet-500/40", description: "Acesso aos produtos HBL com margem 50%" },
  nutritionist_partner: { label: "Nutricionista Parceiro", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", description: "Recebe atribuições automáticas de planos nutricionais" },
  council: { label: "Conselho", color: "bg-rose-500/20 text-rose-300 border-rose-500/40", description: "Acesso gratuito a produtos liberados pelo conselho" },
};

function BadgesTab() {
  const [rows, setRows] = useState<{ id: string; name: string; email: string; badges: { badge_key: string }[] }[] | null>(null);
  const [filter, setFilter] = useState("");
  const fetchAll = useServerFn(listCoachesWithBadges);
  const grant = useServerFn(assignBadge);
  const revoke = useServerFn(revokeBadge);

  const load = async () => {
    setRows(null);
    try {
      const data = await fetchAll();
      setRows(data as any);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar");
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (coachId: string, badge: BadgeKey, has: boolean) => {
    try {
      if (has) {
        await revoke({ data: { coachId, badge } });
        toast.success("Medalha removida");
      } else {
        await grant({ data: { coachId, badge } });
        toast.success("Medalha atribuída");
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  };

  if (!rows) return <Loader2 className="h-5 w-5 animate-spin text-white/50" />;

  const filtered = rows.filter((r) => {
    const q = filter.toLowerCase().trim();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar coach por nome ou email..."
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#E24B4A]"
        />
        <span className="text-xs text-white/50">{filtered.length} coaches</span>
      </div>

      <div className="grid gap-3 text-xs">
        {(Object.keys(BADGE_META) as BadgeKey[]).map((k) => (
          <div key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${BADGE_META[k].color}`}>
            <Award className="h-3.5 w-3.5" />
            <span className="font-semibold">{BADGE_META[k].label}</span>
            <span className="text-white/60">— {BADGE_META[k].description}</span>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum coach encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-3" style={{ backgroundColor: "#161616" }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-white">{c.name}</p>
                  <p className="text-[11px] text-white/40">{c.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(BADGE_META) as BadgeKey[]).map((b) => {
                  const has = c.badges.some((x) => x.badge_key === b);
                  return (
                    <button
                      key={b}
                      onClick={() => toggle(c.id, b, has)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition ${
                        has ? BADGE_META[b].color : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
                      }`}
                    >
                      {has && <Check className="h-3 w-3" />}
                      {BADGE_META[b].label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Desafios ────────────────────────────────────────────────────
type Challenge = {
  id: string; title: string; description: string | null;
  start_date: string; end_date: string; required_points: number;
  reward_label: string; reward_value: number; reward_image_url: string | null; is_active: boolean;
};
const blankChallenge = (): Challenge => ({
  id: "", title: "", description: "", start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  required_points: 100, reward_label: "", reward_value: 0, reward_image_url: "", is_active: true,
});

function ChallengesTab() {
  const [items, setItems] = useState<Challenge[] | null>(null);
  const [editing, setEditing] = useState<Challenge | null>(null);

  const load = async () => {
    const { data } = await supabase.from("career_challenges").select("*").order("end_date", { ascending: false });
    setItems((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.reward_label.trim()) return toast.error("Informe título e prêmio.");
    const { id, ...rest } = editing;
    const { error } = id
      ? await supabase.from("career_challenges").update(rest as any).eq("id", id)
      : await supabase.from("career_challenges").insert(rest as any);
    if (error) toast.error(error.message); else { toast.success("Salvo"); setEditing(null); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Excluir desafio?")) return;
    const { error } = await supabase.from("career_challenges").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  if (editing) return <ChallengeForm value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      <button onClick={() => setEditing(blankChallenge())}
        className="flex items-center gap-1.5 rounded-lg bg-[#E24B4A] px-3 py-2 text-sm font-bold text-white">
        <Plus className="h-4 w-4" /> Novo desafio
      </button>
      {!items ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : items.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum desafio cadastrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-4" style={{ backgroundColor: "#161616" }}>
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-white">{c.title}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-white/5 text-white/40"}`}>
                  {c.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-xs text-white/50 mt-1">{c.start_date} → {c.end_date}</p>
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-white/70">Meta: <strong className="text-[#E24B4A]">{c.required_points} pts</strong></p>
                <p className="text-white/70">Prêmio: {c.reward_label} {c.reward_value > 0 && `· R$ ${Number(c.reward_value).toFixed(2)}`}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(c)} className="flex-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-white">Editar</button>
                <button onClick={() => del(c.id)} className="rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-300 px-2 py-1 text-xs text-white/70"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeForm({ value, onChange, onSave, onCancel }: {
  value: Challenge; onChange: (v: Challenge) => void; onSave: () => void; onCancel: () => void;
}) {
  const f = (k: keyof Challenge, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-3" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-white">{value.id ? "Editar" : "Novo"} desafio</h2>
        <button onClick={onCancel} className="text-white/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Título" value={value.title} onChange={(v) => f("title", v)} />
        <Input label="Meta de pontos" type="number" value={value.required_points} onChange={(v) => f("required_points", Number(v))} />
        <Input label="Início" type="date" value={value.start_date} onChange={(v) => f("start_date", v)} />
        <Input label="Fim" type="date" value={value.end_date} onChange={(v) => f("end_date", v)} />
        <Input label="Prêmio (descrição)" value={value.reward_label} onChange={(v) => f("reward_label", v)} />
        <Input label="Valor do prêmio (R$)" type="number" value={value.reward_value} onChange={(v) => f("reward_value", Number(v))} />
        <Input label="Imagem do prêmio (URL)" value={value.reward_image_url || ""} onChange={(v) => f("reward_image_url", v)} className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm text-white/70 sm:col-span-2">
          <input type="checkbox" checked={value.is_active} onChange={(e) => f("is_active", e.target.checked)} /> Ativo
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs text-white/60 mb-1">Descrição</span>
          <textarea rows={3} value={value.description || ""} onChange={(e) => f("description", e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white">Cancelar</button>
        <button onClick={onSave} className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] px-3 py-1.5 text-sm font-bold text-white">
          <Save className="h-3.5 w-3.5" /> Salvar
        </button>
      </div>
    </div>
  );
}

// ─── Loja de troca de pontos ─────────────────────────────────────
type Redeem = {
  id: string; name: string; description: string | null; image_url: string | null;
  points_cost: number; stock: number | null; category: string | null;
  is_active: boolean; sort_order: number;
};
const blankRedeem = (): Redeem => ({
  id: "", name: "", description: "", image_url: "", points_cost: 100,
  stock: null, category: "", is_active: true, sort_order: 0,
});

function RedeemTab() {
  const [items, setItems] = useState<Redeem[] | null>(null);
  const [editing, setEditing] = useState<Redeem | null>(null);

  const load = async () => {
    const { data } = await supabase.from("points_redeem_products").select("*").order("sort_order");
    setItems((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || editing.points_cost <= 0) return toast.error("Informe nome e custo em pontos.");
    const { id, ...rest } = editing;
    const { error } = id
      ? await supabase.from("points_redeem_products").update(rest as any).eq("id", id)
      : await supabase.from("points_redeem_products").insert(rest as any);
    if (error) toast.error(error.message); else { toast.success("Salvo"); setEditing(null); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("points_redeem_products").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  if (editing) return (
    <div className="rounded-xl border border-white/10 p-5 space-y-3" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-white">{editing.id ? "Editar" : "Novo"} produto resgatável</h2>
        <button onClick={() => setEditing(null)} className="text-white/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nome" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
        <Input label="Custo em pontos" type="number" value={editing.points_cost} onChange={(v) => setEditing({ ...editing, points_cost: Number(v) })} />
        <Input label="Estoque (vazio = ilimitado)" type="number" value={editing.stock ?? ""} onChange={(v) => setEditing({ ...editing, stock: v === "" ? null : Number(v) })} />
        <Input label="Categoria" value={editing.category || ""} onChange={(v) => setEditing({ ...editing, category: v })} />
        <Input label="Imagem (URL)" value={editing.image_url || ""} onChange={(v) => setEditing({ ...editing, image_url: v })} className="sm:col-span-2" />
        <Input label="Ordem" type="number" value={editing.sort_order} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) })} />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Ativo
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs text-white/60 mb-1">Descrição</span>
          <textarea rows={3} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white" />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => setEditing(null)} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white">Cancelar</button>
        <button onClick={save} className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] px-3 py-1.5 text-sm font-bold text-white">
          <Save className="h-3.5 w-3.5" /> Salvar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing(blankRedeem())}
        className="flex items-center gap-1.5 rounded-lg bg-[#E24B4A] px-3 py-2 text-sm font-bold text-white">
        <Plus className="h-4 w-4" /> Novo produto resgatável
      </button>
      {!items ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : items.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum produto cadastrado na loja de pontos.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 p-4" style={{ backgroundColor: "#161616" }}>
              {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover rounded-md mb-2" />}
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-white">{p.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-white/5 text-white/40"}`}>
                  {p.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-xs text-[#E24B4A] mt-1 font-bold">{p.points_cost} pontos</p>
              <p className="text-xs text-white/50">Estoque: {p.stock ?? "ilimitado"}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(p)} className="flex-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-white">Editar</button>
                <button onClick={() => del(p.id)} className="rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-300 px-2 py-1 text-xs text-white/70"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", className = "" }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-white/60 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A]" />
    </label>
  );
}
