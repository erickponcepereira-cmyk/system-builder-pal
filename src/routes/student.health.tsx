import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/health")({
  head: () => ({
    meta: [
      { title: "Anamnese — FitMind Club" },
      { name: "description", content: "Preencha sua anamnese de forma guiada, uma pergunta por vez." },
    ],
  }),
  component: AnamneseWizardPage,
});

type Meal = { name: string; time: string; foods: string; quantities: string };

type FormState = {
  // Dados pessoais
  gender: string;
  height: string; // cm
  profession: string;
  marital_status: string;
  // Histórico médico
  preexisting_conditions: string;
  surgical_history: string;
  current_medications: string;
  supplements_used: string;
  food_allergies: string;
  food_intolerances: string;
  blood_type: string;
  has_diabetes: boolean | null;
  has_hypertension: boolean | null;
  has_cardiopathy: boolean | null;
  other_chronic_conditions: string;
  // Objetivos
  protocol_reason: string;
  objective: string;
  dietary_goals: string[];
  dietary_goals_other: string;
  // Alimentação
  food_diary: Meal[];
  fast_food_frequency: string;
  special_dietary_habits: string;
  water_intake_daily: string;
  disliked_foods: string;
  // Estilo de vida
  exercises_regularly: boolean | null;
  exercise_level: string;
  exercise_type: string;
  exercise_time: string;
  exercise_duration: string;
  exercise_since: string;
  sleep_hours: string;
  stress_level: string;
  stress_strategies: string;
  alcohol_consumption: boolean | null;
  alcohol_frequency: string;
  tobacco_consumption: boolean | null;
  tobacco_quantity: string;
  // Observações
  additional_observations: string;
};

const DEFAULT_MEALS: Meal[] = [
  { name: "Café da manhã", time: "", foods: "", quantities: "" },
  { name: "Lanche 1", time: "", foods: "", quantities: "" },
  { name: "Almoço", time: "", foods: "", quantities: "" },
  { name: "Lanche 2", time: "", foods: "", quantities: "" },
  { name: "Lanche 3", time: "", foods: "", quantities: "" },
  { name: "Jantar", time: "", foods: "", quantities: "" },
  { name: "Ceia", time: "", foods: "", quantities: "" },
];

const initial: FormState = {
  gender: "", height: "", profession: "", marital_status: "",
  preexisting_conditions: "", surgical_history: "", current_medications: "",
  supplements_used: "", food_allergies: "",
  food_intolerances: "", blood_type: "",
  has_diabetes: null, has_hypertension: null, has_cardiopathy: null,
  other_chronic_conditions: "",
  protocol_reason: "", objective: "", dietary_goals: [], dietary_goals_other: "",
  food_diary: DEFAULT_MEALS, fast_food_frequency: "", special_dietary_habits: "",
  water_intake_daily: "", disliked_foods: "",
  exercises_regularly: null, exercise_level: "", exercise_type: "",
  exercise_time: "", exercise_duration: "", exercise_since: "",
  sleep_hours: "", stress_level: "", stress_strategies: "",
  alcohol_consumption: null, alcohol_frequency: "",
  tobacco_consumption: null, tobacco_quantity: "",
  additional_observations: "",
};

function AnamneseWizardPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: student } = profile?.id
        ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
        : { data: null };
      if (!student?.id) { setLoading(false); return; }
      setStudentId(student.id);
      const { data } = await supabase.from("anamnesis_forms").select("*").eq("student_id", student.id).order("filled_at", { ascending: false }).limit(1).maybeSingle();
      if (data) {
        setFormId(data.id);
        const d: any = data;
        setForm({
          gender: d.gender || "",
          height: d.height ? String(d.height) : "",
          profession: d.profession || "",
          marital_status: d.marital_status || "",
          preexisting_conditions: d.preexisting_conditions || "",
          surgical_history: d.surgical_history || "",
          current_medications: d.current_medications || "",
          supplements_used: d.supplements_used || "",
          food_allergies: d.food_allergies || "",
          food_intolerances: d.food_intolerances || "",
          blood_type: d.blood_type || "",
          has_diabetes: d.has_diabetes,
          has_hypertension: d.has_hypertension,
          has_cardiopathy: d.has_cardiopathy,
          other_chronic_conditions: d.other_chronic_conditions || "",
          protocol_reason: d.protocol_reason || "",
          objective: d.objective || "",
          dietary_goals: Array.isArray(d.dietary_goals) ? d.dietary_goals : [],
          dietary_goals_other: d.dietary_goals_other || "",
          food_diary: (Array.isArray(d.food_diary) && d.food_diary.length > 0) ? d.food_diary : DEFAULT_MEALS,
          fast_food_frequency: d.fast_food_frequency || "",
          special_dietary_habits: d.special_dietary_habits || "",
          water_intake_daily: d.water_intake_daily || "",
          disliked_foods: d.disliked_foods || "",
          exercises_regularly: d.exercises_regularly,
          exercise_level: d.exercise_level || "",
          exercise_type: d.exercise_type || "",
          exercise_time: d.exercise_time || "",
          exercise_duration: d.exercise_duration || "",
          exercise_since: d.exercise_since || "",
          sleep_hours: d.sleep_hours || "",
          stress_level: d.stress_level || "",
          stress_strategies: d.stress_strategies || "",
          alcohol_consumption: d.alcohol_consumption,
          alcohol_frequency: d.alcohol_frequency || "",
          tobacco_consumption: d.tobacco_consumption,
          tobacco_quantity: d.tobacco_quantity || "",
          additional_observations: d.additional_observations || "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((c) => ({ ...c, [key]: value }));

  const steps = useMemo(() => buildSteps(form, update), [form]);
  const total = steps.length;
  const current = steps[step];
  const progress = Math.round(((step + 1) / total) * 100);

  const save = async (final: boolean) => {
    if (!studentId) return toast.error("Aluno não encontrado");
    setSaving(true);
    const payload: any = {
      student_id: studentId,
      gender: form.gender || null,
      height: form.height ? Number(form.height) : null,
      profession: form.profession || null,
      marital_status: form.marital_status || null,
      preexisting_conditions: form.preexisting_conditions || null,
      surgical_history: form.surgical_history || null,
      current_medications: form.current_medications || null,
      supplements_used: form.supplements_used || null,
      food_allergies: form.food_allergies || null,
      protocol_reason: form.protocol_reason || null,
      objective: form.objective || null,
      dietary_goals: form.dietary_goals,
      dietary_goals_other: form.dietary_goals_other || null,
      food_diary: form.food_diary,
      fast_food_frequency: form.fast_food_frequency || null,
      special_dietary_habits: form.special_dietary_habits || null,
      water_intake_daily: form.water_intake_daily || null,
      disliked_foods: form.disliked_foods || null,
      exercises_regularly: form.exercises_regularly,
      exercise_level: form.exercise_level || null,
      exercise_type: form.exercise_type || null,
      exercise_time: form.exercise_time || null,
      exercise_duration: form.exercise_duration || null,
      exercise_since: form.exercise_since || null,
      sleep_hours: form.sleep_hours || null,
      stress_level: form.stress_level || null,
      stress_strategies: form.stress_strategies || null,
      alcohol_consumption: form.alcohol_consumption,
      alcohol_frequency: form.alcohol_frequency || null,
      tobacco_consumption: form.tobacco_consumption,
      tobacco_quantity: form.tobacco_quantity || null,
      additional_observations: form.additional_observations || null,
      filled_at: new Date().toISOString(),
    };
    if (final) {
      payload.student_signature_confirmed = true;
      payload.confirmed_at = new Date().toISOString();
    }
    const res = formId
      ? await supabase.from("anamnesis_forms").update(payload).eq("id", formId).select("id").single()
      : await supabase.from("anamnesis_forms").insert(payload).select("id").single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    setFormId(res.data.id);
    if (final) {
      toast.success("Anamnese concluída!");
      navigate({ to: "/student/profile" });
    } else {
      toast.success("Progresso salvo");
    }
  };

  if (loading) return <div className="p-4 text-sm text-white/60">Carregando...</div>;

  return (
    <div className="flex min-h-screen flex-col p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-white/40">Anamnese nutricional</p>
          <h1 className="text-lg font-bold text-white">Pergunta {step + 1} de {total}</h1>
        </div>
      </header>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-6 flex-1 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{current.section}</p>
        <h2 className="mt-1 text-xl font-bold text-white">{current.title}</h2>
        {current.help && <p className="mt-1 text-xs text-white/50">{current.help}</p>}
        <div className="mt-5">{current.render()}</div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-white/80 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-xl bg-white/5 px-3 py-3 text-xs font-bold text-white/60"
        >
          Salvar
        </button>
        {step < total - 1 ? (
          <button
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            Próxima <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Concluir
          </button>
        )}
      </div>
    </div>
  );
}

type StepDef = { section: string; title: string; help?: string; render: () => React.ReactNode };

function buildSteps(form: FormState, update: <K extends keyof FormState>(k: K, v: FormState[K]) => void): StepDef[] {
  const text = (k: keyof FormState, placeholder = "", maxLen = 500) => (
    <textarea
      value={String((form as any)[k] || "")}
      onChange={(e) => update(k, e.target.value as any)}
      maxLength={maxLen}
      rows={3}
      placeholder={placeholder}
      className="field-control"
      autoFocus
    />
  );
  const input = (k: keyof FormState, placeholder = "", maxLen = 100) => (
    <input
      value={String((form as any)[k] || "")}
      onChange={(e) => update(k, e.target.value as any)}
      maxLength={maxLen}
      placeholder={placeholder}
      className="field-control"
      autoFocus
    />
  );
  const choice = (k: keyof FormState, opts: { value: string; label: string }[]) => (
    <div className="grid gap-2">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => update(k, o.value as any)}
          className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
            (form as any)[k] === o.value ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/80 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  const boolChoice = (k: keyof FormState) => (
    <div className="grid grid-cols-2 gap-2">
      {[{ v: true, l: "Sim" }, { v: false, l: "Não" }].map((o) => (
        <button
          key={o.l}
          type="button"
          onClick={() => update(k, o.v as any)}
          className={`rounded-xl px-4 py-4 text-sm font-bold transition-colors ${
            (form as any)[k] === o.v ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/80"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
  const multi = (k: keyof FormState, opts: string[]) => {
    const arr: string[] = ((form as any)[k] as string[]) || [];
    const toggle = (v: string) => {
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      update(k, next as any);
    };
    return (
      <div className="grid gap-2">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
              arr.includes(o) ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/80"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  };

  const steps: StepDef[] = [
    // Dados pessoais
    { section: "Dados pessoais", title: "Qual seu sexo biológico?", render: () => choice("gender", [
      { value: "masculino", label: "Masculino" },
      { value: "feminino", label: "Feminino" },
      { value: "outro", label: "Outro / prefiro não dizer" },
    ]) },
    { section: "Dados pessoais", title: "Qual sua altura (cm)?", help: "Ex: 175", render: () => input("height", "175", 6) },
    { section: "Dados pessoais", title: "Qual sua profissão?", render: () => input("profession", "Ex: Designer, Médico...") },
    { section: "Dados pessoais", title: "Qual seu estado civil?", render: () => choice("marital_status", [
      { value: "solteiro", label: "Solteiro(a)" },
      { value: "casado", label: "Casado(a) / União estável" },
      { value: "divorciado", label: "Divorciado(a)" },
      { value: "viuvo", label: "Viúvo(a)" },
    ]) },

    // Histórico médico
    { section: "Histórico médico", title: "Tem alguma doença pré-existente?", help: "Diabetes, hipertensão, doenças cardíacas, etc. Escreva 'nenhuma' se não tiver.", render: () => text("preexisting_conditions", "Descreva...") },
    { section: "Histórico médico", title: "Histórico de cirurgias", help: "Cite cirurgias relevantes e quando aconteceram.", render: () => text("surgical_history", "Ex: apendicectomia em 2018...") },
    { section: "Histórico médico", title: "Uso atual de medicamentos", render: () => text("current_medications", "Liste medicamentos e dosagem...") },
    { section: "Histórico médico", title: "Faz ou já fez uso de suplementos?", help: "Se sim, quais?", render: () => text("supplements_used", "Ex: whey protein, creatina, ômega 3...") },
    { section: "Histórico médico", title: "Alergias alimentares ou intolerâncias", render: () => text("food_allergies", "Ex: lactose, glúten, frutos do mar...") },

    // Objetivos
    { section: "Objetivos", title: "Qual o principal motivo da sua participação no protocolo?", render: () => text("protocol_reason", "Conte sua motivação...") },
    { section: "Objetivos", title: "Qual seu objetivo principal?", render: () => choice("objective", [
      { value: "perda_peso", label: "Perda de peso" },
      { value: "manutencao", label: "Manutenção de peso" },
      { value: "ganho_peso", label: "Ganho de peso" },
    ]) },
    { section: "Objetivos", title: "Desejos específicos sobre alimentação", help: "Toque em todas as opções que se aplicam.", render: () => multi("dietary_goals", [
      "Melhorar energia",
      "Controlar açúcar no sangue",
      "Ganhar massa muscular",
      "Melhorar disposição",
      "Reduzir compulsão alimentar",
    ]) },
    { section: "Objetivos", title: "Outros desejos relacionados à alimentação", help: "Opcional", render: () => text("dietary_goals_other", "Descreva...") },

    // Recordatório alimentar
    { section: "Alimentação", title: "Recordatório alimentar de um dia habitual", help: "Preencha cada refeição com horário, alimentos e quantidades em medidas caseiras.", render: () => (
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {form.food_diary.map((meal, i) => (
          <div key={i} className="rounded-xl bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <input
                value={meal.name}
                onChange={(e) => { const next = [...form.food_diary]; next[i] = { ...meal, name: e.target.value }; update("food_diary", next); }}
                placeholder="Refeição"
                className="bg-transparent text-sm font-bold text-white outline-none"
              />
              <button onClick={() => { const next = form.food_diary.filter((_, j) => j !== i); update("food_diary", next); }} className="text-white/40">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              value={meal.time}
              onChange={(e) => { const next = [...form.food_diary]; next[i] = { ...meal, time: e.target.value }; update("food_diary", next); }}
              placeholder="Horário (ex: 7h30)"
              className="field-control mb-2"
            />
            <textarea
              value={meal.foods}
              onChange={(e) => { const next = [...form.food_diary]; next[i] = { ...meal, foods: e.target.value }; update("food_diary", next); }}
              placeholder="Alimentos consumidos"
              rows={2}
              className="field-control mb-2"
            />
            <textarea
              value={meal.quantities}
              onChange={(e) => { const next = [...form.food_diary]; next[i] = { ...meal, quantities: e.target.value }; update("food_diary", next); }}
              placeholder="Quantidades (medidas caseiras)"
              rows={2}
              className="field-control"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => update("food_diary", [...form.food_diary, { name: "Refeição extra", time: "", foods: "", quantities: "" }])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-xs font-bold text-white/60"
        >
          <Plus className="h-4 w-4" /> Adicionar refeição
        </button>
      </div>
    ) },
    { section: "Alimentação", title: "Frequência de fast food, industrializados e refrigerantes", render: () => text("fast_food_frequency", "Ex: 2x por semana...") },
    { section: "Alimentação", title: "Hábitos alimentares especiais", help: "Vegetarianismo, veganismo, jejum intermitente, restrições.", render: () => text("special_dietary_habits", "Descreva...") },
    { section: "Alimentação", title: "Quanta água você bebe por dia?", help: "Em copos ou litros.", render: () => input("water_intake_daily", "Ex: 2L ou 8 copos") },
    { section: "Alimentação", title: "Alimentos que você não consome / não gosta", render: () => text("disliked_foods", "Liste os alimentos...") },

    // Estilo de vida
    { section: "Estilo de vida", title: "Você pratica atividade física?", render: () => boolChoice("exercises_regularly") },
    ...(form.exercises_regularly ? [
      { section: "Estilo de vida", title: "Qual seu nível de atividade física?", render: () => choice("exercise_level", [
        { value: "leve", label: "Leve" },
        { value: "moderado", label: "Moderado" },
        { value: "intenso", label: "Intenso" },
      ]) } as StepDef,
      { section: "Estilo de vida", title: "Qual modalidade você pratica?", help: "Tipo de exercício", render: () => input("exercise_type", "Musculação, corrida, funcional...") } as StepDef,
      { section: "Estilo de vida", title: "Horário que pratica", render: () => input("exercise_time", "Ex: manhã, 6h") } as StepDef,
      { section: "Estilo de vida", title: "Tempo gasto por sessão", render: () => input("exercise_duration", "Ex: 1h") } as StepDef,
      { section: "Estilo de vida", title: "Há quanto tempo pratica?", render: () => input("exercise_since", "Ex: 2 anos") } as StepDef,
    ] : []),
    { section: "Estilo de vida", title: "Quantas horas você dorme por noite?", render: () => input("sleep_hours", "Ex: 7h") },
    { section: "Estilo de vida", title: "Qual seu nível de estresse?", render: () => choice("stress_level", [
      { value: "baixo", label: "Baixo" },
      { value: "moderado", label: "Moderado" },
      { value: "alto", label: "Alto" },
    ]) },
    { section: "Estilo de vida", title: "Como você lida com o estresse?", render: () => text("stress_strategies", "Suas estratégias...") },
    { section: "Estilo de vida", title: "Consome bebida alcoólica?", render: () => boolChoice("alcohol_consumption") },
    ...(form.alcohol_consumption ? [
      { section: "Estilo de vida", title: "Com que frequência e tipo de bebida?", render: () => text("alcohol_frequency", "Ex: cerveja, 2x por semana") } as StepDef,
    ] : []),
    { section: "Estilo de vida", title: "Faz uso de tabaco?", render: () => boolChoice("tobacco_consumption") },
    ...(form.tobacco_consumption ? [
      { section: "Estilo de vida", title: "Quantos cigarros/dia e há quanto tempo?", render: () => text("tobacco_quantity", "Ex: 10 por dia há 5 anos") } as StepDef,
    ] : []),

    // Observações finais
    { section: "Finalizando", title: "Observações adicionais", help: "Alguma informação relevante que queira compartilhar com seu coach?", render: () => text("additional_observations", "Opcional...") },
  ];

  return steps;
}
