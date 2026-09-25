import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Flag, Info, Loader2, ShoppingBag, Ticket } from "lucide-react";
import { listMyRunChallenges, joinRunChallenge, type RunChallengeCard } from "@/lib/run-challenges.functions";

const fmt = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RunChallengesSection() {
  const fetchList = useServerFn(listMyRunChallenges);
  const doJoin = useServerFn(joinRunChallenge);
  const [items, setItems] = useState<RunChallengeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchList());
    } catch (e) {
      console.warn("run challenges", e);
    } finally {
      setLoading(false);
    }
  }, [fetchList]);

  useEffect(() => { load(); }, [load]);

  const join = async (c: RunChallengeCard) => {
    const tierId = picked[c.id] || c.tiers[0]?.id;
    if (!tierId) return toast.error("Escolha uma meta.");
    setJoining(c.id);
    try {
      const res = await doJoin({ data: { challengeId: c.id, tierId } });
      if (!res.ok) return toast.error(res.error);
      toast.success("Inscrição confirmada! Bora correr 🏃");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao entrar no desafio");
    } finally {
      setJoining(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Desafios de corrida</h2>
      </div>

      <p className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Os quilômetros são validados pelo print do dia no Nike Run — registre a corrida no painel
          de Evolução com a foto. Nosso sistema próprio de corrida está em desenvolvimento e em breve
          tudo será automático.
        </span>
      </p>

      {items.map((c) => {
        const tier = c.tiers.find((t) => t.id === (c.entry?.tier_id ?? picked[c.id])) ?? c.tiers[0];
        const target = tier ? Number(tier.target_km) : 0;
        const pct = target > 0 ? Math.min(100, Math.round((c.progressKm / target) * 100)) : 0;
        const canJoin = !c.entry && !c.ended && (!c.requires_ticket || c.ticketsAvailable > 0);

        return (
          <article key={c.id} className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
            <header className="space-y-1">
              <h3 className="text-base font-bold text-foreground">{c.name}</h3>
              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                De {fmt(c.starts_on)} a {fmt(c.ends_on)}
                {c.ownerName ? ` • por ${c.ownerName}` : ""}
              </p>
            </header>

            {c.entry ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-foreground">
                    {c.progressKm.toFixed(1)} km <span className="text-muted-foreground">de {target} km</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                {c.entry.goal_reached_at ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Meta batida em {new Date(c.entry.goal_reached_at).toLocaleDateString("pt-BR")}
                    {c.ended ? "." : " — continue somando km!"}
                  </p>
                ) : c.ended ? (
                  <p className="text-xs text-muted-foreground">Desafio encerrado em {fmt(c.ends_on)}.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Faltam {Math.max(0, target - c.progressKm).toFixed(1)} km para bater a meta.
                  </p>
                )}
                {!c.ended && (
                  <Link to="/student/evolution" className="inline-block text-xs font-semibold text-primary underline">
                    Registrar corrida no painel de Evolução
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {c.tiers.map((t) => {
                    const active = (picked[c.id] ?? c.tiers[0]?.id) === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPicked((p) => ({ ...p, [c.id]: t.id }))}
                        className={`rounded-xl border p-2 text-center text-xs font-bold transition ${
                          active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        }`}
                      >
                        {t.label}
                        <span className="block text-[10px] font-normal">{Number(t.target_km)} km</span>
                      </button>
                    );
                  })}
                </div>

                {canJoin ? (
                  <button
                    type="button"
                    disabled={joining === c.id}
                    onClick={() => join(c)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {joining === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                    Entrar no desafio
                  </button>
                ) : c.product ? (
                  <Link
                    to="/student/store"
                    search={{ produto: c.product.id, checkout: "1" }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Comprar acesso — {money(c.product.price)}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Fale com o organizador para liberar seu ticket deste desafio.
                  </p>
                )}

                {c.requires_ticket && c.ticketsAvailable > 0 && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Você tem {c.ticketsAvailable} ticket{c.ticketsAvailable > 1 ? "s" : ""} disponível para este desafio.
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
