import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, AlertTriangle, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/medical-record")({
  head: () => ({
    meta: [
      { title: "Ficha médica — FitMind Club" },
      { name: "description", content: "Seu histórico médico, condições, alergias, medicamentos e tipo sanguíneo." },
    ],
  }),
  component: MedicalRecordPage,
});

type Anamnese = {
  filled_at: string | null;
  gender: string | null;
  height: number | null;
  preexisting_conditions: string | null;
  current_medications: string | null;
  food_allergies: string | null;
  additional_observations: string | null;
  blood_type: string | null;
  food_intolerances: string | null;
  has_diabetes: boolean | null;
  has_hypertension: boolean | null;
  has_cardiopathy: boolean | null;
  other_chronic_conditions: string | null;
  surgical_history: string | null;
  supplements_used: string | null;
};

function MedicalRecordPage() {
  const [anamnese, setAnamnese] = useState<Anamnese | null>(null);
  const [profileBloodType, setProfileBloodType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Anamnese[]>([]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("id, blood_type").eq("user_id", userData.user.id).maybeSingle();
      if (profile?.blood_type) setProfileBloodType((profile as any).blood_type);
      const { data: student } = profile?.id
        ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
        : { data: null };
      if (!student?.id) { setLoading(false); return; }
      const { data: anams } = await supabase
        .from("anamnesis_forms")
        .select("filled_at,gender,height,preexisting_conditions,current_medications,food_allergies,additional_observations,blood_type,food_intolerances,has_diabetes,has_hypertension,has_cardiopathy,other_chronic_conditions,surgical_history,supplements_used")
        .eq("student_id", student.id)
        .order("filled_at", { ascending: false });
      const rows = (anams as Anamnese[]) || [];
      setAnamnese(rows[0] || null);
      setHistory(rows);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Saúde</p>
          <h1 className="text-2xl font-bold text-white">Ficha médica</h1>
        </div>
      </header>

      {loading && <p className="text-sm text-white/40">Carregando...</p>}

      {!loading && !anamnese && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Sem registro</p>
          </div>
          <p className="text-sm text-white/80">Preencha sua anamnese para criar sua ficha médica.</p>
          <Link to="/student/health" className="mt-3 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Preencher anamnese</Link>
        </div>
      )}

      {!loading && anamnese && (
        <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-white">Resumo atual</h2>
              <p className="text-[10px] text-white/40">{anamnese.filled_at ? `Atualizada em ${new Date(anamnese.filled_at).toLocaleDateString("pt-BR")}` : "—"}</p>
            </div>
          </div>

          {(anamnese.has_diabetes || anamnese.has_hypertension || anamnese.has_cardiopathy || anamnese.other_chronic_conditions) && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {anamnese.has_diabetes && <ConditionChip label="Diabetes" />}
              {anamnese.has_hypertension && <ConditionChip label="Hipertensão" />}
              {anamnese.has_cardiopathy && <ConditionChip label="Cardiopatia" />}
              {anamnese.other_chronic_conditions && <ConditionChip label={anamnese.other_chronic_conditions} />}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Tipo sanguíneo" value={anamnese.blood_type || profileBloodType} />
            <Info label="Altura" value={anamnese.height ? `${anamnese.height} cm` : null} />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
            <Info label="Alergias alimentares" value={anamnese.food_allergies} />
            <Info label="Intolerâncias alimentares" value={anamnese.food_intolerances} />
            <Info label="Condições preexistentes" value={anamnese.preexisting_conditions} />
            <Info label="Medicamentos contínuos" value={anamnese.current_medications} />
            <Info label="Suplementos em uso" value={anamnese.supplements_used} />
            <Info label="Histórico cirúrgico" value={anamnese.surgical_history} />
            <Info label="Observações" value={anamnese.additional_observations} />
          </div>

          <Link to="/student/health" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            Atualizar ficha médica →
          </Link>
        </section>
      )}

      {!loading && history.length > 1 && (
        <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <h2 className="mb-3 text-sm font-bold text-white">Histórico</h2>
          <div className="space-y-2">
            {history.slice(1).map((h, i) => (
              <div key={i} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <p className="text-[11px] font-bold text-white">{h.filled_at ? new Date(h.filled_at).toLocaleDateString("pt-BR") : "—"}</p>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                  {h.blood_type && <span>Sangue: {h.blood_type}</span>}
                  {h.current_medications && <span className="truncate">Med: {h.current_medications}</span>}
                  {h.food_allergies && <span className="truncate">Alergias: {h.food_allergies}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs text-white">{value || "—"}</p>
    </div>
  );
}

function ConditionChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
      <AlertTriangle className="h-3 w-3" />{label}
    </span>
  );
}
