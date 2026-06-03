import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Activity, ExternalLink, Scale, Droplets, Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/assessments")({
  head: () => ({
    meta: [
      { title: "Minhas Avaliações — FitMind Club" },
      { name: "description", content: "Histórico das suas bioimpedâncias e comparativos." },
    ],
  }),
  component: MyAssessmentsPage,
});

type Row = {
  id: string;
  assessment_date: string;
  method: string | null;
  weight: number | null;
  bmi: number | null;
  body_fat: number | null;
  muscle_mass: number | null;
  skeletal_muscle: number | null;
  visceral_fat: number | null;
  body_water: number | null;
  basal_metabolism: number | null;
  body_age: number | null;
  coach_id: string;
};

type ShareMap = Record<string, string>;

const fmt = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function MyAssessmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [shares, setShares] = useState<ShareMap>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      // RLS will scope assessments to those with student_id matching this user
      const { data, error } = await supabase
        .from("coach_body_assessments" as never)
        .select("id, assessment_date, method, weight, bmi, body_fat, muscle_mass, skeletal_muscle, visceral_fat, body_water, basal_metabolism, body_age, coach_id")
        .order("assessment_date" as never, { ascending: false });
      if (error) console.error(error);
      const list = (data as any[]) || [];
      setRows(list);
      if (list.length > 0) {
        const ids = list.map((r) => r.id);
        const { data: sh } = await supabase
          .from("assessment_shares" as never)
          .select("assessment_id, token")
          .in("assessment_id" as never, ids as never);
        const map: ShareMap = {};
        ((sh as any[]) || []).forEach((s) => { map[s.assessment_id] = s.token; });
        setShares(map);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const compareData = selected.length >= 2
    ? selected.map((id) => rows.find((r) => r.id === id)!).filter(Boolean)
        .sort((a, b) => new Date(a.assessment_date).getTime() - new Date(b.assessment_date).getTime())
    : [];

  const delta = (a: number | null, b: number | null) => {
    if (a == null || b == null) return null;
    return Number((b - a).toFixed(2));
  };
  const DeltaBadge = ({ value, invert }: { value: number | null; invert?: boolean }) => {
    if (value == null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    const good = invert ? value < 0 : value > 0;
    if (value === 0) return <span className="text-xs text-muted-foreground">0</span>;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${good ? "text-green-400" : "text-red-400"}`}>
        {value > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {value > 0 ? "+" : ""}{value}
      </span>
    );
  };

  return (
    <div className="flex flex-col pb-6">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Link to="/student/profile" className="text-muted-foreground hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Minhas Avaliações</h1>
          <p className="text-xs text-muted-foreground">Bioimpedâncias realizadas pelo seu coach</p>
        </div>
      </header>



      <div className="p-4 space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Você ainda não possui avaliações registradas. Peça ao seu coach para realizar a bioimpedância no FitMindShape.</p>
          </div>
        ) : (
          <>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Selecione 2 ou mais avaliações para comparar. Selecionadas: <b>{selected.length}</b>
              </p>
              {selected.length > 0 && (
                <button onClick={() => setSelected([])} className="text-xs text-primary hover:underline font-bold">Limpar</button>
              )}
            </div>

            {compareData.length >= 2 && (
              <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3 overflow-x-auto">
                <h3 className="font-bold text-foreground text-sm">Comparativo ({compareData.length} avaliações)</h3>
                <div className="min-w-fit">
                  <div
                    className="grid gap-2 text-xs"
                    style={{ gridTemplateColumns: `minmax(120px, 1fr) repeat(${compareData.length}, minmax(90px, 1fr))` }}
                  >
                    <div className="text-muted-foreground font-bold">Métrica</div>
                    {compareData.map((c, i) => (
                      <div key={c.id} className="text-center text-muted-foreground font-bold">
                        {fmt(c.assessment_date)}
                        {i === 0 && <span className="block text-[10px] opacity-70">(base)</span>}
                      </div>
                    ))}
                    {[
                      { label: "Peso (kg)", k: "weight", invert: true },
                      { label: "IMC", k: "bmi", invert: true },
                      { label: "% Gordura", k: "body_fat", invert: true },
                      { label: "Massa Muscular", k: "muscle_mass", invert: false },
                      { label: "% Músculo Esq.", k: "skeletal_muscle", invert: false },
                      { label: "Gordura Visceral", k: "visceral_fat", invert: true },
                      { label: "% Água", k: "body_water", invert: false },
                      { label: "Idade Corporal", k: "body_age", invert: true },
                    ].map(({ label, k, invert }) => {
                      const base = (compareData[0] as any)[k];
                      return (
                        <div key={k} className="contents">
                          <div className="text-foreground">{label}</div>
                          {compareData.map((c, i) => {
                            const v = (c as any)[k];
                            return (
                              <div key={c.id} className="text-center font-medium text-foreground flex items-center justify-center gap-1">
                                <span>{v ?? "—"}</span>
                                {i > 0 && <DeltaBadge value={delta(base, v)} invert={invert} />}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {rows.map((r) => {
                const isSel = selected.includes(r.id);
                const token = shares[r.id];
                return (
                  <div key={r.id} className={`rounded-2xl border bg-card p-4 ${isSel ? "border-primary" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm">{fmt(r.assessment_date)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{r.method || "bioimpedance"}</p>
                      </div>
                      <button onClick={() => toggle(r.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold ${isSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                        {isSel ? "Selecionada" : "Comparar"}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
                      <div><Scale className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" /><p className="font-bold text-foreground">{r.weight ?? "—"}</p><p className="text-[10px] text-muted-foreground">kg</p></div>
                      <div><Activity className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" /><p className="font-bold text-foreground">{r.body_fat ?? "—"}</p><p className="text-[10px] text-muted-foreground">% gordura</p></div>
                      <div><Heart className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" /><p className="font-bold text-foreground">{r.muscle_mass ?? "—"}</p><p className="text-[10px] text-muted-foreground">músculo</p></div>
                      <div><Droplets className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" /><p className="font-bold text-foreground">{r.body_water ?? "—"}</p><p className="text-[10px] text-muted-foreground">% água</p></div>
                    </div>
                    {token && (
                      <a href={`/resultado/${token}`} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Ver relatório completo
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
