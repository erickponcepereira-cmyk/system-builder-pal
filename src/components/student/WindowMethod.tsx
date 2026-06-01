// src/components/student/WindowMethod.tsx
// Método das Janelas FitMind
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingDown, Dumbbell, Info, ChevronDown, ChevronUp } from "lucide-react";
import janelaFechadaAsset from "@/assets/janela_fechada.png.asset.json";
import janelaMeioAsset from "@/assets/janela_meio_aberta.png.asset.json";
import janelaAbertaAsset from "@/assets/janela_aberta.png.asset.json";

type Goal = "slim" | "mass";
interface MealState { protein: boolean; fiber: boolean; carb: boolean }
type WindowStatus = "closed" | "half" | "open";

const MEAL_LABELS = ["Café da Manhã", "Lanche da Manhã", "Almoço", "Lanche da Tarde", "Janta", "Ceia"];
const MEAL_ICONS = ["☀️", "🍎", "🍽️", "🥗", "🌙", "⭐"];
const WINDOW_SRC: Record<WindowStatus, string> = {
  closed: janelaFechadaAsset.url,
  half: janelaMeioAsset.url,
  open: janelaAbertaAsset.url,
};

const emptyMeal = (): MealState => ({ protein: false, fiber: false, carb: false });
const emptyMeals = (): MealState[] => Array(6).fill(null).map(emptyMeal);

function getWindowStatus(meal: MealState, goal: Goal): WindowStatus {
  const required = goal === "mass"
    ? [meal.protein, meal.fiber, meal.carb]
    : [meal.protein, meal.fiber];
  const checked = required.filter(Boolean).length;
  if (checked === required.length) return "closed";
  if (checked > 0) return "half";
  return "open";
}

function WindowImage({ status, size = 64 }: { status: WindowStatus; size?: number }) {
  const label = { closed: "Janela Fechada ✓", half: "Janela Meio Aberta", open: "Janela Aberta ✗" }[status];
  const glow = {
    closed: "drop-shadow(0 0 8px rgba(34,197,94,0.7))",
    half: "drop-shadow(0 0 8px rgba(234,179,8,0.7))",
    open: "drop-shadow(0 0 8px rgba(239,68,68,0.5))",
  }[status];
  return (
    <img
      src={WINDOW_SRC[status]}
      alt={label}
      width={size}
      height={size}
      style={{ filter: glow, transition: "filter 0.4s ease, transform 0.3s ease" }}
      className="object-contain"
    />
  );
}

interface MealCardProps {
  index: number;
  meal: MealState;
  goal: Goal;
  onChange: (index: number, field: keyof MealState, value: boolean) => void;
}
function MealCard({ index, meal, goal, onChange }: MealCardProps) {
  const status = getWindowStatus(meal, goal);
  const statusColors = {
    closed: "border-green-500/40 bg-green-500/5",
    half: "border-yellow-500/40 bg-yellow-500/5",
    open: "border-red-500/30 bg-red-500/5",
  };
  const statusLabel = { closed: "Janela Fechada", half: "Meio Aberta", open: "Aberta" };
  const statusTextColor = { closed: "text-green-400", half: "text-yellow-400", open: "text-red-400" };
  const fields: { key: keyof MealState; label: string; color: string; emoji: string }[] = [
    { key: "protein", label: "Proteína", color: "bg-blue-500", emoji: "🥩" },
    { key: "fiber", label: "Fibra", color: "bg-green-500", emoji: "🥦" },
    ...(goal === "mass" ? [{ key: "carb" as keyof MealState, label: "Carboidrato", color: "bg-orange-500", emoji: "🍚" }] : []),
  ];
  return (
    <div className={`rounded-2xl border p-4 transition-all duration-300 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{MEAL_ICONS[index]}</span>
          <div>
            <p className="text-sm font-bold text-foreground">{MEAL_LABELS[index]}</p>
            <p className={`text-xs font-bold ${statusTextColor[status]}`}>{statusLabel[status]}</p>
          </div>
        </div>
        <WindowImage status={status} size={56} />
      </div>
      <div className={`grid gap-2 ${goal === "mass" ? "grid-cols-3" : "grid-cols-2"}`}>
        {fields.map(({ key, label, color, emoji }) => (
          <button
            key={key}
            onClick={() => onChange(index, key, !meal[key])}
            className={`flex flex-col items-center gap-1 rounded-xl p-2.5 text-xs font-bold border transition-all duration-200 select-none ${meal[key] ? `${color} text-white border-transparent shadow-lg scale-95` : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:scale-95"}`}
          >
            <span className="text-base">{emoji}</span>
            <span>{label}</span>
            <span className="text-[10px] opacity-70">{meal[key] ? "✓" : "Toque"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryBar({ meals, goal }: { meals: MealState[]; goal: Goal }) {
  const statuses = meals.map(m => getWindowStatus(m, goal));
  const closed = statuses.filter(s => s === "closed").length;
  const half = statuses.filter(s => s === "half").length;
  const open = statuses.filter(s => s === "open").length;
  const score = Math.round((closed * 2 + half * 1) / (meals.length * 2) * 100);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground text-center">Resumo do Dia</p>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Pontuação nutricional</span>
          <span className={`font-bold ${score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{score}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-green-500/10 p-2"><p className="text-xl font-bold text-green-400">{closed}</p><p className="text-[11px] text-muted-foreground">Fechadas</p></div>
        <div className="rounded-xl bg-yellow-500/10 p-2"><p className="text-xl font-bold text-yellow-400">{half}</p><p className="text-[11px] text-muted-foreground">Meio Abertas</p></div>
        <div className="rounded-xl bg-red-500/10 p-2"><p className="text-xl font-bold text-red-400">{open}</p><p className="text-[11px] text-muted-foreground">Abertas</p></div>
      </div>
      {open >= 3 && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
          <p className="text-xs font-bold text-red-400">⚠️ {open} janelas abertas — risco de dores de cabeça, irritabilidade e fadiga.</p>
        </div>
      )}
      {open === 2 && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-2">
          <p className="text-xs font-bold text-orange-400">⚠️ 2 janelas abertas — possível inchaço, fome excessiva e queda de energia.</p>
        </div>
      )}
      {closed >= 5 && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2">
          <p className="text-xs font-bold text-green-400">🏆 Excelente! {closed} janelas fechadas. Seu metabolismo agradece!</p>
        </div>
      )}
    </div>
  );
}

function ExplanationSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Entenda o Método das Janelas</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-5 space-y-3 border-t border-border pt-4">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-xs font-bold text-green-400 mb-1">🪟 Janela Fechada</p>
            <p className="text-xs text-muted-foreground">Proteínas + fibras (+ carbo para ganho de massa). Saciedade, músculo e digestão em dia.</p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
            <p className="text-xs font-bold text-yellow-400 mb-1">🪟 Meio Aberta</p>
            <p className="text-xs text-muted-foreground">Apenas proteína OU apenas fibra — falta um nutriente.</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs font-bold text-red-400 mb-1">🪟 Totalmente Aberta</p>
            <p className="text-xs text-muted-foreground">Sem proteína e sem fibra — só carbo e/ou gordura.</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props { studentId: string; readOnly?: boolean; date?: string; hideExplanation?: boolean }

export function WindowMethod({ studentId, readOnly = false, date, hideExplanation = false }: Props) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [meals, setMeals] = useState<MealState[]>(emptyMeals());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const targetDate = date || new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setGoal(null);
    setMeals(emptyMeals());
    supabase
      .from("window_method_logs" as never)
      .select("*")
      .eq("student_id" as never, studentId)
      .eq("log_date" as never, targetDate)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setGoal(d.goal);
          setMeals([1, 2, 3, 4, 5, 6].map((n) => ({
            protein: d[`meal_${n}_protein`],
            fiber: d[`meal_${n}_fiber`],
            carb: d[`meal_${n}_carb`],
          })));
        }
        setLoading(false);
      });
  }, [studentId, targetDate]);

  const save = useCallback(async (updatedMeals: MealState[], updatedGoal: Goal) => {
    if (!studentId || !updatedGoal || readOnly) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = { student_id: studentId, log_date: targetDate, goal: updatedGoal };
      updatedMeals.forEach((m, i) => {
        const n = i + 1;
        payload[`meal_${n}_protein`] = m.protein;
        payload[`meal_${n}_fiber`] = m.fiber;
        payload[`meal_${n}_carb`] = m.carb;
      });
      await supabase.from("window_method_logs" as never).upsert(payload as never, { onConflict: "student_id,log_date" } as never);
    } finally {
      setSaving(false);
    }
  }, [studentId, targetDate, readOnly]);

  const handleGoal = (g: Goal) => {
    if (readOnly) return;
    setGoal(g);
    if (g === "slim") {
      const reset = meals.map(m => ({ ...m, carb: false }));
      setMeals(reset);
      save(reset, g);
    } else {
      save(meals, g);
    }
  };

  const handleMealChange = (index: number, field: keyof MealState, value: boolean) => {
    if (readOnly) return;
    const updated = meals.map((m, i) => i === index ? { ...m, [field]: value } : m);
    setMeals(updated);
    if (goal) save(updated, goal);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (readOnly && !goal) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">Nenhum registro de janelas para esta data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1 py-2">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">🪟</span>
          <h2 className="text-xl font-bold text-foreground">Método das Janelas</h2>
          <span className="text-2xl">🪟</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(targetDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        {saving && (
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
          </div>
        )}
      </div>

      {!goal ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <p className="text-sm font-bold text-foreground text-center">Qual é o objetivo deste dia?</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleGoal("slim")} className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/30 bg-card p-4 hover:border-primary hover:bg-primary/5 transition-all">
              <TrendingDown className="h-8 w-8 text-primary" />
              <span className="text-sm font-bold text-foreground">Emagrecer</span>
              <span className="text-[11px] text-muted-foreground text-center">Proteína + Fibra por refeição</span>
            </button>
            <button onClick={() => handleGoal("mass")} className="flex flex-col items-center gap-2 rounded-xl border-2 border-orange-500/30 bg-card p-4 hover:border-orange-500 hover:bg-orange-500/5 transition-all">
              <Dumbbell className="h-8 w-8 text-orange-400" />
              <span className="text-sm font-bold text-foreground">Ganhar Massa</span>
              <span className="text-[11px] text-muted-foreground text-center">Proteína + Fibra + Carboidrato</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2">
              {goal === "slim" ? <TrendingDown className="h-4 w-4 text-primary" /> : <Dumbbell className="h-4 w-4 text-orange-400" />}
              <span className="text-xs font-bold text-foreground">{goal === "slim" ? "Emagrecer" : "Ganhar Massa"}</span>
            </div>
            {!readOnly && (
              <button onClick={() => setGoal(null)} className="text-[11px] text-muted-foreground underline">Trocar</button>
            )}
          </div>

          <SummaryBar meals={meals} goal={goal} />

          <div className={`space-y-3 ${readOnly ? "pointer-events-none opacity-95" : ""}`}>
            {meals.map((meal, i) => (
              <MealCard key={i} index={i} meal={meal} goal={goal} onChange={handleMealChange} />
            ))}
          </div>
        </>
      )}

      {!hideExplanation && <ExplanationSection />}
    </div>
  );
}
