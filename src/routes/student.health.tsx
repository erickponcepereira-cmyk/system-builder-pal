import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ClipboardList, Droplets, Dumbbell, HeartPulse, Moon, Save, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/health")({
  head: () => ({
    meta: [
      { title: "Saúde — FitMind Club" },
      { name: "description", content: "Preencha sua anamnese e acompanhe avaliações corporais." },
    ],
  }),
  component: HealthPage,
});

type FormState = {
  profession: string;
  objective: string;
  sleep_hours: string;
  water_intake_daily: string;
  preexisting_conditions: string;
  current_medications: string;
  food_allergies: string;
  exercises_regularly: boolean;
  exercise_level: string;
  exercise_type: string;
  stress_level: string;
  additional_observations: string;
};

interface Evaluation {
  id: string;
  evaluation_date: string;
  weight: number | null;
  bmi: number | null;
  fat_percentage: number | null;
  muscle_percentage: number | null;
  visceral_fat: number | null;
  bmi_classification: string | null;
  fat_classification: string | null;
  muscle_classification: string | null;
  visceral_fat_classification: string | null;
}

const initialForm: FormState = {
  profession: "",
  objective: "",
  sleep_hours: "",
  water_intake_daily: "",
  preexisting_conditions: "",
  current_medications: "",
  food_allergies: "",
  exercises_regularly: false,
  exercise_level: "iniciante",
  exercise_type: "",
  stress_level: "moderado",
  additional_observations: "",
};

function HealthPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (!student?.id) {
        setLoading(false);
        return;
      }

      setStudentId(student.id);

      const [anamnesisRes, evaluationRes] = await Promise.all([
        supabase
          .from("anamnesis_forms")
          .select("id,profession,objective,sleep_hours,water_intake_daily,preexisting_conditions,current_medications,food_allergies,exercises_regularly,exercise_level,exercise_type,stress_level,additional_observations")
          .eq("student_id", student.id)
          .order("filled_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("bioimpedance_evaluations")
          .select("id,evaluation_date,weight,bmi,fat_percentage,muscle_percentage,visceral_fat,bmi_classification,fat_classification,muscle_classification,visceral_fat_classification")
          .eq("student_id", student.id)
          .order("evaluation_date", { ascending: false })
          .limit(5),
      ]);

      if (anamnesisRes.data) {
        setFormId(anamnesisRes.data.id);
        setForm({
          profession: anamnesisRes.data.profession || "",
          objective: anamnesisRes.data.objective || "",
          sleep_hours: anamnesisRes.data.sleep_hours || "",
          water_intake_daily: anamnesisRes.data.water_intake_daily || "",
          preexisting_conditions: anamnesisRes.data.preexisting_conditions || "",
          current_medications: anamnesisRes.data.current_medications || "",
          food_allergies: anamnesisRes.data.food_allergies || "",
          exercises_regularly: !!anamnesisRes.data.exercises_regularly,
          exercise_level: anamnesisRes.data.exercise_level || "iniciante",
          exercise_type: anamnesisRes.data.exercise_type || "",
          stress_level: anamnesisRes.data.stress_level || "moderado",
          additional_observations: anamnesisRes.data.additional_observations || "",
        });
      }
      setEvaluations((evaluationRes.data as Evaluation[]) || []);
      setLoading(false);
    })();
  }, []);

  const latest = evaluations[0];
  const completion = useMemo(() => {
    const fields = [form.objective, form.sleep_hours, form.water_intake_daily, form.preexisting_conditions, form.exercise_type, form.stress_level];
    const filled = fields.filter((value) => String(value || "").trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [form]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!studentId) {
      toast.error("Perfil de aluno não encontrado.");
      return;
    }
    setSaving(true);
    const payload = {
      student_id: studentId,
      ...form,
      filled_at: new Date().toISOString(),
      student_signature_confirmed: true,
      confirmed_at: new Date().toISOString(),
    };

    const result = formId
      ? await supabase.from("anamnesis_forms").update(payload as never).eq("id", formId).select("id").single()
      : await supabase.from("anamnesis_forms").insert(payload as never).select("id").single();

    if (result.error) toast.error(result.error.message);
    else {
      setFormId(result.data.id);
      toast.success("Anamnese salva com sucesso!");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Saúde</p>
        <h1 className="text-2xl font-bold text-foreground">Anamnese e avaliações</h1>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Anamnese do desafio</h2>
            <p className="text-xs text-muted-foreground">{completion}% preenchida</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} />
        </div>
      </section>

      {latest && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Última bioimpedância</h2>
              <p className="text-[11px] text-muted-foreground">{new Date(latest.evaluation_date).toLocaleDateString("pt-BR")}</p>
            </div>
            <HeartPulse className="h-5 w-5 text-primary" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric icon={Scale} label="Peso" value={latest.weight ? `${latest.weight} kg` : "—"} note={latest.bmi_classification || "IMC"} />
            <Metric icon={Activity} label="Gordura" value={latest.fat_percentage ? `${latest.fat_percentage}%` : "—"} note={latest.fat_classification || "Percentual"} />
            <Metric icon={Dumbbell} label="Músculo" value={latest.muscle_percentage ? `${latest.muscle_percentage}%` : "—"} note={latest.muscle_classification || "Massa"} />
            <Metric icon={HeartPulse} label="Visceral" value={latest.visceral_fat ? String(latest.visceral_fat) : "—"} note={latest.visceral_fat_classification || "Nível"} />
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Field label="Objetivo principal">
          <select value={form.objective} onChange={(event) => update("objective", event.target.value)} className="field-control">
            <option value="">Selecione</option>
            <option value="emagrecimento">Emagrecimento</option>
            <option value="ganho_massa">Ganho de massa</option>
            <option value="condicionamento">Condicionamento</option>
            <option value="saude">Saúde e rotina</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sono/noite">
            <input value={form.sleep_hours} onChange={(event) => update("sleep_hours", event.target.value)} placeholder="Ex: 7h" className="field-control" />
          </Field>
          <Field label="Água/dia">
            <input value={form.water_intake_daily} onChange={(event) => update("water_intake_daily", event.target.value)} placeholder="Ex: 2L" className="field-control" />
          </Field>
        </div>

        <Field label="Profissão">
          <input value={form.profession} onChange={(event) => update("profession", event.target.value)} className="field-control" />
        </Field>

        <Field label="Condições pré-existentes">
          <textarea value={form.preexisting_conditions} onChange={(event) => update("preexisting_conditions", event.target.value)} rows={2} className="field-control" />
        </Field>

        <Field label="Medicamentos em uso">
          <textarea value={form.current_medications} onChange={(event) => update("current_medications", event.target.value)} rows={2} className="field-control" />
        </Field>

        <Field label="Alergias alimentares">
          <textarea value={form.food_allergies} onChange={(event) => update("food_allergies", event.target.value)} rows={2} className="field-control" />
        </Field>

        <label className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm text-foreground">
          <input type="checkbox" checked={form.exercises_regularly} onChange={(event) => update("exercises_regularly", event.target.checked)} className="h-4 w-4 accent-primary" />
          Pratico exercícios regularmente
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nível">
            <select value={form.exercise_level} onChange={(event) => update("exercise_level", event.target.value)} className="field-control">
              <option value="iniciante">Iniciante</option>
              <option value="intermediario">Intermediário</option>
              <option value="avancado">Avançado</option>
            </select>
          </Field>
          <Field label="Estresse">
            <select value={form.stress_level} onChange={(event) => update("stress_level", event.target.value)} className="field-control">
              <option value="baixo">Baixo</option>
              <option value="moderado">Moderado</option>
              <option value="alto">Alto</option>
            </select>
          </Field>
        </div>

        <Field label="Tipo de exercício">
          <input value={form.exercise_type} onChange={(event) => update("exercise_type", event.target.value)} placeholder="Musculação, caminhada, funcional..." className="field-control" />
        </Field>

        <Field label="Observações adicionais">
          <textarea value={form.additional_observations} onChange={(event) => update("additional_observations", event.target.value)} rows={3} className="field-control" />
        </Field>

        <button onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {saving ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar anamnese"}
        </button>
      </section>

      {evaluations.length > 1 && (
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico</h2>
          <div className="space-y-2">
            {evaluations.slice(1).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-card p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                    <Moon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{new Date(item.evaluation_date).toLocaleDateString("pt-BR")}</p>
                    <p className="text-[11px] text-muted-foreground">{item.bmi_classification || "Avaliação corporal"}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-primary">{item.weight ? `${item.weight} kg` : "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Scale; label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{note}</p>
    </div>
  );
}
