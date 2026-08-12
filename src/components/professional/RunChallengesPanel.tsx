import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Save, Trash2, Trophy, Users, X } from "lucide-react";
import {
  listOwnedRunChallenges,
  saveRunChallenge,
  deleteRunChallenge,
  listRunChallengeParticipants,
  reviewRunLog,
  type OwnedRunChallenge,
  type RunChallengeParticipant,
} from "@/lib/run-challenges.functions";

type TierDraft = { id?: string; label: string; target_km: number };
type Draft = {
  id?: string;
  name: string;
  description: string;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  requires_ticket: boolean;
  professional_product_id: string | null;
  tiers: TierDraft[];
};

const emptyDraft = (): Draft => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    name: `Desafio de KM — ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
    description: "",
    starts_on: iso(first),
    ends_on: iso(last),
    is_active: true,
    requires_ticket: true,
    professional_product_id: null,
    tiers: [
      { label: "50 km", target_km: 50 },
      { label: "100 km", target_km: 100 },
      { label: "150 km", target_km: 150 },
    ],
  };
};

const fmt = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");

export function RunChallengesPanel() {
  const fetchList = useServerFn(listOwnedRunChallenges);
  const doSave = useServerFn(saveRunChallenge);
  const doDelete = useServerFn(deleteRunChallenge);
  const fetchParticipants = useServerFn(listRunChallengeParticipants);
  const doReview = useServerFn(reviewRunLog);

  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<OwnedRunChallenge[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; kind: string; name: string }>>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RunChallengeParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchList();
      setChallenges(res.challenges);
      setProducts(res.products);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [fetchList]);

  useEffect(() => { load(); }, [load]);

  const openParticipants = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setLoadingParticipants(true);
    try {
      setParticipants(await fetchParticipants({ data: { challengeId: id } }));
    } finally {
      setLoadingParticipants(false);
    }
  };

  const edit = (c: OwnedRunChallenge) => setDraft({
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    is_active: c.is_active,
    requires_ticket: c.requires_ticket,
    professional_product_id: c.professional_product_id,
    tiers: c.tiers.map((t) => ({ id: t.id, label: t.label, target_km: Number(t.target_km) })),
  });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await doSave({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description || null,
          starts_on: draft.starts_on,
          ends_on: draft.ends_on,
          is_active: draft.is_active,
          requires_ticket: draft.requires_ticket,
          professional_product_id: draft.professional_product_id,
          tiers: draft.tiers.map((t) => ({ ...(t.id ? { id: t.id } : {}), label: t.label, target_km: Number(t.target_km) })),
        },
      });
      if (!res.ok) return toast.error(res.error);
      toast.success("Desafio salvo!");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: OwnedRunChallenge) => {
    if (!confirm(`Excluir o desafio "${c.name}"?`)) return;
    const res = await doDelete({ data: { id: c.id } });
    if (!res.ok) return toast.error(res.error);
    toast.success("Desafio excluído");
    load();
  };

  const review = async (logId: string, status: "approved" | "rejected") => {
    const res = await doReview({ data: { logId, status } });
    if (!res.ok) return toast.error(res.error);
    toast.success(status === "approved" ? "Registro aprovado" : "Registro rejeitado");
    if (openId) setParticipants(await fetchParticipants({ data: { challengeId: openId } }));
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Desafios de corrida</h2>
          <p className="text-xs text-muted-foreground">
            Você define nome, período, produto que libera o ticket e as metas de km.
          </p>
        </div>
        <button
          onClick={() => setDraft(emptyDraft())}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>

      {draft && (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{draft.id ? "Editar desafio" : "Novo desafio"}</h3>
            <button onClick={() => setDraft(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>

          <label className="block text-xs font-semibold text-muted-foreground">
            Nome
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>

          <label className="block text-xs font-semibold text-muted-foreground">
            Descrição
            <textarea
              value={draft.description}
              rows={2}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              Início
              <input type="date" value={draft.starts_on}
                onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              Fim
              <input type="date" value={draft.ends_on}
                onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>
          </div>

          <label className="block text-xs font-semibold text-muted-foreground">
            Produto que libera o ticket
            <select
              value={draft.professional_product_id ?? ""}
              onChange={(e) => setDraft({ ...draft, professional_product_id: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Sem produto vinculado</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.requires_ticket}
                onChange={(e) => setDraft({ ...draft, requires_ticket: e.target.checked })} />
              Exigir ticket para entrar
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
              Ativo
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Metas (km)</p>
            {draft.tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={t.label}
                  onChange={(e) => {
                    const tiers = [...draft.tiers]; tiers[i] = { ...t, label: e.target.value };
                    setDraft({ ...draft, tiers });
                  }}
                  placeholder="Nome da faixa"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <input
                  type="number" min={1} step="0.1" value={t.target_km}
                  onChange={(e) => {
                    const tiers = [...draft.tiers]; tiers[i] = { ...t, target_km: Number(e.target.value) };
                    setDraft({ ...draft, tiers });
                  }}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <button
                  onClick={() => setDraft({ ...draft, tiers: draft.tiers.filter((_, idx) => idx !== i) })}
                  className="text-muted-foreground"
                ><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button
              onClick={() => setDraft({ ...draft, tiers: [...draft.tiers, { label: "", target_km: 50 }] })}
              className="text-xs font-semibold text-primary"
            >+ Adicionar meta</button>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}

      {challenges.length === 0 && !draft && (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum desafio de corrida criado ainda.
        </p>
      )}

      {challenges.map((c) => (
        <div key={c.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">{c.name}</h3>
              <p className="text-xs text-muted-foreground">
                {fmt(c.starts_on)} a {fmt(c.ends_on)} • {c.tiers.map((t) => `${Number(t.target_km)}km`).join(" / ")}
                {c.is_active ? "" : " • inativo"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => edit(c)} className="text-xs font-semibold text-primary">Editar</button>
              <button onClick={() => remove(c)} className="text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          <button
            onClick={() => openParticipants(c.id)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary"
          >
            <Users className="h-3.5 w-3.5" /> {c.participants} inscrito{c.participants === 1 ? "" : "s"}
          </button>

          {openId === c.id && (
            loadingParticipants ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : participants.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém inscrito ainda.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-base font-bold text-foreground">{participants.length}</p>
                    <p className="text-[10px] text-muted-foreground">Inscritos</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-base font-bold text-green-500">
                      {participants.filter((p) => p.goalReachedAt).length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Bateram a meta</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <p className="text-base font-bold text-primary">
                      {Math.round(participants.reduce((t, p) => t + p.pct, 0) / participants.length)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">Média da meta</p>
                  </div>
                </div>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou coach..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />

                {participants
                  .filter((p) => {
                    const t = search.trim().toLowerCase();
                    if (!t) return true;
                    return (p.name || "").toLowerCase().includes(t) || (p.coachName || "").toLowerCase().includes(t);
                  })
                  .map((p, idx) => (
                  <div key={p.entryId} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                          {idx + 1}
                        </span>
                        {p.name || "Participante"}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.km.toFixed(1)} / {p.targetKm} km</p>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${p.goalReachedAt ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${Math.max(2, p.pct)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Faixa {p.tierLabel} • {p.pct.toFixed(0)}%
                      {p.goalReachedAt ? "" : ` • faltam ${p.remainingKm.toFixed(1)} km`}
                      {p.goalReachedAt && (
                        <span className="ml-1 font-semibold text-green-500">
                          <Trophy className="mr-1 inline h-3 w-3" />
                          meta batida em {new Date(p.goalReachedAt).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Coach responsável: <span className="font-medium text-foreground">{p.coachName || "—"}</span>
                    </p>
                    <div className="mt-2 space-y-1">
                      {p.logs.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-muted-foreground">
                            {fmt(l.run_date)} • {Number(l.distance_km).toFixed(1)} km
                            {!l.photo_url && " • sem print"}
                            {l.review_status === "rejected" && " • rejeitado"}
                            {l.review_status === "approved" && " • aprovado"}
                          </span>
                          <span className="flex items-center gap-2">
                            {l.photo_url && (
                              <a href={l.photo_url} target="_blank" rel="noreferrer" className="text-primary">ver print</a>
                            )}
                            <button onClick={() => review(l.id, "approved")} className="text-green-500">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => review(l.id, "rejected")} className="text-red-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      ))}
                      {p.logs.length === 0 && <p className="text-[11px] text-muted-foreground">Sem registros no período.</p>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

        </div>
      ))}
    </div>
  );
}
