import { formatDateOnlyBR } from "@/lib/date-only";

export type AnamnesisRow = Record<string, unknown> & { id: string };

export const ANAMNESIS_COLUMNS =
  "id,student_id,filled_at,confirmed_at,student_signature_confirmed,gender,height,profession,marital_status,blood_type," +
  "preexisting_conditions,surgical_history,current_medications,supplements_used,food_allergies,food_intolerances," +
  "has_diabetes,has_hypertension,has_cardiopathy,other_chronic_conditions," +
  "protocol_reason,objective,dietary_goals,dietary_goals_other," +
  "food_diary,fast_food_frequency,special_dietary_habits,water_intake_daily,disliked_foods," +
  "exercises_regularly,exercise_level,exercise_type,exercise_time,exercise_duration,exercise_since," +
  "sleep_hours,stress_level,stress_strategies,alcohol_consumption,alcohol_frequency,tobacco_consumption,tobacco_quantity," +
  "additional_observations";

const fmtDate = (d: unknown) => {
  if (!d || typeof d !== "string") return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? formatDateOnlyBR(d, { day: "2-digit", month: "long", year: "numeric" })
    : new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

function text(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) {
    const list = v.map((x) => (typeof x === "string" ? x : String(x))).filter(Boolean);
    return list.length ? list.join(", ") : null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

function Info({ label, value }: { label: string; value: unknown }) {
  const v = text(value);
  if (!v) return null;
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="whitespace-pre-wrap text-xs text-white/85">{v}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children.flat() : [children];
  const hasContent = arr.some((c) => c !== null && c !== false && c !== undefined);
  if (!hasContent) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

type Meal = { name?: string; time?: string; foods?: string; quantities?: string };

function FoodDiary({ value }: { value: unknown }) {
  let meals: Meal[] = [];
  if (Array.isArray(value)) meals = value as Meal[];
  else if (typeof value === "string" && value.trim().startsWith("[")) {
    try { meals = JSON.parse(value) as Meal[]; } catch { meals = []; }
  } else if (typeof value === "string" && value.trim()) {
    return <Info label="Diário alimentar" value={value} />;
  }
  const filled = meals.filter((m) => (m?.foods || "").trim() || (m?.quantities || "").trim() || (m?.time || "").trim());
  if (!filled.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Diário alimentar</p>
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-white/5 text-white/50">
            <tr>
              <th className="px-2 py-1.5">Refeição</th>
              <th className="px-2 py-1.5">Horário</th>
              <th className="px-2 py-1.5">Alimentos</th>
              <th className="px-2 py-1.5">Quantidades</th>
            </tr>
          </thead>
          <tbody>
            {filled.map((m, i) => (
              <tr key={i} className="border-t border-white/5 text-white/80">
                <td className="px-2 py-1.5 font-semibold">{m.name || "—"}</td>
                <td className="px-2 py-1.5">{m.time || "—"}</td>
                <td className="px-2 py-1.5 whitespace-pre-wrap">{m.foods || "—"}</td>
                <td className="px-2 py-1.5 whitespace-pre-wrap">{m.quantities || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnamnesisView({ row }: { row: AnamnesisRow }) {
  const a = row as Record<string, unknown>;
  const flags = [
    a.has_diabetes ? "Diabetes" : null,
    a.has_hypertension ? "Hipertensão" : null,
    a.has_cardiopathy ? "Cardiopatia" : null,
    text(a.other_chronic_conditions),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">{fmtDate(a.filled_at)}</p>
        {Boolean(a.confirmed_at || a.student_signature_confirmed) && (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">Assinada</span>
        )}
      </div>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <span key={f} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">{f}</span>
          ))}
        </div>
      )}

      <Section title="Dados pessoais">
        <Info label="Gênero" value={a.gender} />
        <Info label="Altura" value={a.height ? `${a.height} cm` : null} />
        <Info label="Profissão" value={a.profession} />
        <Info label="Estado civil" value={a.marital_status} />
        <Info label="Tipo sanguíneo" value={a.blood_type} />
      </Section>

      <Section title="Histórico de saúde">
        <Info label="Condições preexistentes" value={a.preexisting_conditions} />
        <Info label="Histórico cirúrgico" value={a.surgical_history} />
        <Info label="Medicamentos contínuos" value={a.current_medications} />
        <Info label="Suplementos em uso" value={a.supplements_used} />
        <Info label="Alergias alimentares" value={a.food_allergies} />
        <Info label="Intolerâncias alimentares" value={a.food_intolerances} />
      </Section>

      <Section title="Objetivos">
        <Info label="Objetivo" value={a.objective} />
        <Info label="Motivo do protocolo" value={a.protocol_reason} />
        <Info label="Objetivos alimentares" value={a.dietary_goals} />
        <Info label="Outros objetivos" value={a.dietary_goals_other} />
      </Section>

      <Section title="Alimentação">
        <Info label="Frequência de fast food" value={a.fast_food_frequency} />
        <Info label="Hábitos alimentares especiais" value={a.special_dietary_habits} />
        <Info label="Consumo de água por dia" value={a.water_intake_daily} />
        <Info label="Alimentos que não gosta" value={a.disliked_foods} />
      </Section>

      <FoodDiary value={a.food_diary} />

      <Section title="Estilo de vida">
        <Info label="Pratica exercícios" value={a.exercises_regularly} />
        <Info label="Nível de exercício" value={a.exercise_level} />
        <Info label="Tipo de exercício" value={a.exercise_type} />
        <Info label="Horário do exercício" value={a.exercise_time} />
        <Info label="Duração" value={a.exercise_duration} />
        <Info label="Pratica desde" value={a.exercise_since} />
        <Info label="Sono" value={a.sleep_hours} />
        <Info label="Nível de estresse" value={a.stress_level} />
        <Info label="Estratégias para estresse" value={a.stress_strategies} />
        <Info label="Consome álcool" value={a.alcohol_consumption} />
        <Info label="Frequência de álcool" value={a.alcohol_frequency} />
        <Info label="Fumante" value={a.tobacco_consumption} />
        <Info label="Quantidade (tabaco)" value={a.tobacco_quantity} />
      </Section>

      <Section title="Observações">
        <Info label="Observações adicionais" value={a.additional_observations} />
      </Section>
    </div>
  );
}

export default AnamnesisView;
