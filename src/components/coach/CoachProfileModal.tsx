import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Award, Users, Briefcase, ShoppingBag, Trophy, Sparkles, Clock, ChevronDown, ChevronRight, UserCheck, Mail, Phone, Eye, EyeOff, Plane, Utensils, CheckCircle2 } from "lucide-react";
import { getCoachModalData, type CoachModalData, type CoachModalPersonRef, type CoachModalTopProduct } from "@/lib/coach-modal.functions";

function money(v: number | null | undefined) {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateOnly(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-lg font-bold" style={{ color: accent || "#fff" }}>{value}</p>
      {sub ? <p className="text-[10px] text-white/40">{sub}</p> : null}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color || "var(--primary, #ff6a00)" }} />
    </div>
  );
}

function Section({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PeopleList({ people }: { people: CoachModalPersonRef[] }) {
  if (!people.length) return <p className="text-xs text-white/40">Ninguém ainda.</p>;
  return (
    <ul className="space-y-1.5">
      {people.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{p.name}</p>
            {p.specialty && <p className="truncate text-[10px] font-semibold text-primary/80">{p.specialty}</p>}
          </div>
          {p.email ? <span className="ml-3 shrink-0 truncate text-[11px] text-white/40">{p.email}</span> : null}
        </li>
      ))}
    </ul>
  );
}


function TopProducts({ items }: { items: CoachModalTopProduct[] }) {
  if (!items.length) return <p className="text-xs text-white/40">Sem vendas no período.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((p, i) => (
        <li key={p.productId} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">#{i + 1}</span>
            <span className="truncate text-sm text-white">{p.name}</span>
          </div>
          <div className="ml-3 text-right">
            <p className="text-xs font-semibold text-white">{money(p.revenue)}</p>
            <p className="text-[10px] text-white/40">{p.qty} venda(s)</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CoachProfileModal({ coachId, onClose }: { coachId: string; onClose: () => void }) {
  const fetchData = useServerFn(getCoachModalData);
  const [data, setData] = useState<CoachModalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCoaches, setOpenCoaches] = useState(false);
  const [openPartners, setOpenPartners] = useState(false);
  const [openPros, setOpenPros] = useState(false);
  const [topFilter, setTopFilter] = useState<"month" | "all">("month");
  const [coachesFilter, setCoachesFilter] = useState<"month" | "all">("month");
  const [revealRewards, setRevealRewards] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    fetchData({ data: { coachId } })
      .then((r) => { if (active) setData(r); })
      .catch((e: any) => { if (active) setError(e?.message || "Falha ao carregar"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [coachId, fetchData]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 sm:rounded-3xl"
        style={{ backgroundColor: "#0F0F0F" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>

        {loading ? (
          <div className="p-10 text-center text-sm text-white/50">Carregando coach...</div>
        ) : error || !data ? (
          <div className="p-10 text-center text-sm text-red-400">{error || "Não foi possível carregar"}</div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Header */}
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 via-white/5 to-transparent p-4">
              <div className="flex items-start gap-3">
                {data.coach.photoUrl ? (
                  <img src={data.coach.photoUrl} alt={data.coach.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/40" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-xl font-bold text-primary">
                    {data.coach.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-bold text-white">{data.coach.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                    {data.coach.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{data.coach.email}</span> : null}
                    {data.coach.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{data.coach.phone}</span> : null}
                  </div>
                  {data.coach.classifications?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {data.coach.classifications.map((t) => (
                        <span
                          key={t}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${t === "Aluno" ? "bg-white/10 text-white/70" : t === "Aluno Coach" ? "bg-primary/20 text-primary" : t === "Profissional" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {data.coach.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {data.coach.categories.map((c) => (
                        <span key={c} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/75">{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.patent && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: data.patent.color || "#fff", backgroundColor: data.patent.color ? `${data.patent.color}22` : "rgba(255,255,255,.08)", borderColor: data.patent.color ? `${data.patent.color}55` : "rgba(255,255,255,.15)" }}
                      >
                        <Trophy className="h-3 w-3" /> {data.patent.name}
                      </span>
                    )}
                    {data.medal && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <Award className="h-3 w-3" /> {data.medal.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Último acesso" value={fmtDate(data.coach.lastLoginAt)} />
                <StatCard label="Cadastro" value={fmtDateOnly(data.coach.createdAt)} />
                <StatCard label="Última patente" value={data.patent?.name || "—"} sub={data.patent?.achievedAt ? fmtDateOnly(data.patent.achievedAt) : ""} />
                <StatCard label="Última medalha" value={data.medal?.name || "—"} sub={data.medal?.achievedAt ? fmtDateOnly(data.medal.achievedAt) : ""} />
              </div>
            </div>

            {/* Clients */}
            <Section title="Clientes" icon={<Users className="h-4 w-4 text-primary" />}>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Ativos" value={String(data.clients.active)} accent="#16a34a" />
                <StatCard label="Inativos" value={String(data.clients.inactive)} accent="#dc2626" />
                <StatCard label="Total" value={String(data.clients.total)} />
              </div>
              <p className="mt-2 text-[10px] text-white/40">Baseado em frequência dos últimos 15 dias.</p>
            </Section>

            {/* Direct network */}
            <Section title="Rede direta vinculada" icon={<UserCheck className="h-4 w-4 text-primary" />}>
              <div className="grid grid-cols-4 gap-2">
                <StatCard label="Coaches" value={String(data.directNetwork.coachCommon)} />
                <StatCard label="Profissional" value={String(data.directNetwork.coachProfessional)} />
                <StatCard label="Parceiro" value={String(data.directNetwork.coachPartner)} />
                <StatCard label="Total" value={String(data.directNetwork.total)} accent="var(--primary)" />
              </div>
            </Section>

            {/* Goals */}
            <Section title="Metas do mês" icon={<Sparkles className="h-4 w-4 text-primary" />}>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/70">{data.goals.travel.label}</span>
                    <span className="font-bold text-white">{data.goals.travel.current}/{data.goals.travel.target} ({data.goals.travel.pct}%)</span>
                  </div>
                  <ProgressBar pct={data.goals.travel.pct} />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/70">{data.goals.dinner.label}</span>
                    <span className="font-bold text-white">{money(data.goals.dinner.current)} / {money(data.goals.dinner.target)} ({data.goals.dinner.pct}%)</span>
                  </div>
                  <ProgressBar pct={data.goals.dinner.pct} />
                </div>
              </div>
            </Section>

            {/* Referred */}
            <Section title="Trazidos para a rede" icon={<Briefcase className="h-4 w-4 text-primary" />}>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setOpenPartners((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-left hover:bg-black/40"
                >
                  <span className="text-sm text-white">Parceiros trazidos</span>
                  <span className="flex items-center gap-2 text-sm font-bold text-primary">
                    {data.referredPartners.count}
                    {openPartners ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </span>
                </button>
                {openPartners && <PeopleList people={data.referredPartners.people} />}

                <button
                  type="button"
                  onClick={() => setOpenPros((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-left hover:bg-black/40"
                >
                  <span className="text-sm text-white">Profissionais trazidos</span>
                  <span className="flex items-center gap-2 text-sm font-bold text-primary">
                    {data.referredProfessionals.count}
                    {openPros ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </span>
                </button>
                {openPros && <PeopleList people={data.referredProfessionals.people} />}
              </div>
            </Section>

            {/* Professional products */}
            {data.coach.isProfessional && (
              <Section title="Produtos cadastrados" icon={<ShoppingBag className="h-4 w-4 text-primary" />} right={<span className="text-[10px] text-white/40">{data.products.length} produto(s)</span>}>
                {data.products.length === 0 ? <p className="text-xs text-white/40">Nenhum produto cadastrado.</p> : (
                  <ul className="space-y-1.5">
                    {data.products.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2">
                        {p.image_url ? <img src={p.image_url} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-white/10" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                          <p className="text-[10px] text-white/40">{p.status || "—"}</p>
                        </div>
                        <span className="text-sm font-bold text-primary">{p.price != null ? money(p.price) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* Last sale */}
            <Section title="Última venda" icon={<Clock className="h-4 w-4 text-primary" />}>
              {data.lastSale ? (
                <div className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{data.lastSale.productName || "Venda"}</p>
                    <p className="text-[11px] text-white/50">{fmtDate(data.lastSale.at)}</p>
                  </div>
                  <span className="text-base font-bold text-primary">{money(data.lastSale.amount)}</span>
                </div>
              ) : <p className="text-xs text-white/40">Sem vendas ainda.</p>}
            </Section>

            {/* Top products */}
            <Section
              title="Produtos mais vendidos"
              icon={<Trophy className="h-4 w-4 text-primary" />}
              right={
                <div className="flex rounded-lg bg-black/40 p-0.5">
                  <button onClick={() => setTopFilter("month")} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${topFilter === "month" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>Mês</button>
                  <button onClick={() => setTopFilter("all")} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${topFilter === "all" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>Tempo todo</button>
                </div>
              }
            >
              <TopProducts items={topFilter === "month" ? data.topProductsMonth : data.topProductsAllTime} />
            </Section>

            {/* Recruited coaches */}
            <Section
              title="Coaches trazidos"
              icon={<UserCheck className="h-4 w-4 text-primary" />}
              right={
                <div className="flex rounded-lg bg-black/40 p-0.5">
                  <button onClick={() => setCoachesFilter("month")} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${coachesFilter === "month" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>Último mês</button>
                  <button onClick={() => setCoachesFilter("all")} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${coachesFilter === "all" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>Tempo todo</button>
                </div>
              }
            >
              <p className="text-3xl font-bold text-white">{coachesFilter === "month" ? data.recruitedCoachesMonth : data.recruitedCoachesAllTime}</p>
              <p className="text-[10px] text-white/40">coaches recrutados na rede direta</p>
            </Section>

            {/* Behavioral - placeholder */}
            <Section title="Perfil comportamental" icon={<Sparkles className="h-4 w-4 text-primary" />} right={<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/60">Em breve</span>}>
              <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-center">
                <p className="text-sm text-white/60">Perfil comportamental ainda não definido.</p>
                <p className="mt-1 text-[11px] text-white/40">Em breve mostraremos aqui os produtos mais indicados para esse coach vender de acordo com seu perfil.</p>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
