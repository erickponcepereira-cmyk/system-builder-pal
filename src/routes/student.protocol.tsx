import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, ArrowLeft, Activity, Droplet, Heart, AlertTriangle, Target, Dumbbell, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WindowMethodHistory } from "@/components/student/WindowMethodHistory";


export const Route = createFileRoute("/student/protocol")({
  head: () => ({
    meta: [
      { title: "Meu Protocolo — FitMind Club" },
      { name: "description", content: "Acompanhe o protocolo do seu coach: dieta, treino, metas e ficha de saúde." },
    ],
  }),
  component: StudentProtocolPage,
});

type Protocol = {
  meals_per_day: number | null;
  meal_plan: Array<{ name: string; time: string; options: string[] }>;
  shopping_list: string | null;
  marmita_tips: string | null;
  restrictions: string[];
  daily_calorie_goal: number | null;
  water_goal_ml: number | null;
  weight_goal: number | null;
  general_notes: string | null;
  workout_plan: Array<{ name: string; sets: string; reps: string; rest: string; notes: string }>;
};

type Anamnese = {
  filled_at: string | null;
  gender: string | null;
  height: number | null;
  objective: string | null;
  protocol_reason: string | null;
  preexisting_conditions: string | null;
  current_medications: string | null;
  food_allergies: string | null;
  sleep_hours: string | null;
  stress_level: string | null;
  exercises_regularly: boolean | null;
  additional_observations: string | null;
};

function StudentProtocolPage() {
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [anamnese, setAnamnese] = useState<Anamnese | null>(null);
  const [showAnamnese, setShowAnamnese] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const [{ data: prot }, { data: anam }] = await Promise.all([
        supabase.from("student_protocols" as never).select("*" as never).eq("student_id" as never, student.id as never).maybeSingle(),
        supabase.from("anamnesis_forms").select("filled_at,gender,height,objective,protocol_reason,preexisting_conditions,current_medications,food_allergies,sleep_hours,stress_level,exercises_regularly,additional_observations").eq("student_id", student.id).order("filled_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (prot) setProtocol(prot as any);
      if (anam) setAnamnese(anam as Anamnese);
      setLoading(false);
    })();
  }, []);


  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Saúde e treino</p>
          <h1 className="text-2xl font-bold text-white">Meu Protocolo</h1>
        </div>
      </header>

      {loading && <p className="text-sm text-white/40">Carregando...</p>}

      {/* Método das Janelas — histórico preenchido pelo coach */}
      {!loading && studentId && (
        <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">🪟</span>
            <h2 className="text-sm font-bold text-white">Método das Janelas</h2>
          </div>
          <p className="mb-3 text-[11px] text-white/40">Acompanhamento preenchido pelo seu coach.</p>
          <WindowMethodHistory studentId={studentId} />
        </section>
      )}

      {!loading && !protocol && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Em ativação</p>
          </div>
          <p className="text-sm text-white/80">
            Seu coach ainda não liberou seu protocolo. Após a anamnese e a bioimpedância, dieta, treino e metas vão aparecer aqui.
          </p>
        </div>
      )}

      {!loading && protocol && (
        <>



          {/* Metas */}
          <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <h2 className="mb-3 text-sm font-bold text-white">Metas diárias</h2>
            <div className="grid grid-cols-2 gap-2">
              <Meta icon={Droplet} label="Água" value={protocol.water_goal_ml ? `${(protocol.water_goal_ml / 1000).toFixed(1)}` : "—"} suffix="L" />
              <Meta icon={Target} label="Peso" value={protocol.weight_goal ? `${protocol.weight_goal}` : "—"} suffix="kg" />
            </div>
          </section>

          {/* Restrições */}
          {protocol.restrictions?.length > 0 && (
            <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <h2 className="mb-2 text-sm font-bold text-white">Restrições e condições</h2>
              <div className="flex flex-wrap gap-1.5">
                {protocol.restrictions.map((r) => (
                  <span key={r} className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />{r}
                  </span>
                ))}
              </div>
            </section>
          )}



          {/* Treino */}
          {protocol.workout_plan?.length > 0 && (
            <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="mb-3 flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-white">Treino prescrito</h2>
              </div>
              <div className="space-y-2">
                {protocol.workout_plan.map((w, i) => (
                  <div key={i} className="rounded-xl bg-white/5 p-3">
                    <p className="text-sm font-semibold text-white">{w.name}</p>
                    <p className="mt-1 text-[11px] text-white/60">
                      {[w.sets && `${w.sets} séries`, w.reps && `${w.reps} reps`, w.rest && `descanso ${w.rest}`].filter(Boolean).join(" · ")}
                    </p>
                    {w.notes && <p className="mt-1 text-[11px] text-white/40">{w.notes}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notas gerais */}
          {protocol.general_notes && (
            <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <h2 className="mb-2 text-sm font-bold text-white">Observações do coach</h2>
              <p className="whitespace-pre-wrap text-xs text-white/70">{protocol.general_notes}</p>
            </section>
          )}
        </>
      )}

      {/* Atalhos sempre visíveis */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-3 text-sm font-bold text-white">Documentos profissionais</h2>
        <div className="space-y-2">
          <Shortcut icon={ClipboardList} title="Anamnese" desc="Histórico inicial preenchido com o coach" />
          <Shortcut icon={Activity} title="Bioimpedância" desc="Última avaliação corporal" />
          <Shortcut icon={Heart} title="Acompanhamento médico" desc="Receitas, exames e medicações" />
        </div>
      </section>
    </div>
  );
}

function Meta({ icon: Icon, label, value, suffix }: { icon: any; label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-lg font-bold text-white">{value}<span className="ml-1 text-xs text-white/40">{suffix}</span></p>
    </div>
  );
}

function Shortcut({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] text-white/40">{desc}</p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Em breve</span>
    </div>
  );
}
