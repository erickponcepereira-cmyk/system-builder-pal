import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Camera, Target, User, Activity, PartyPopper, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Bem-vindo — FitChain" },
      { name: "description", content: "Configure seu perfil para começar o desafio." },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = [
  { id: 1, label: "Dados", icon: User },
  { id: 2, label: "Objetivo", icon: Target },
  { id: 3, label: "Bioimpedância", icon: Activity },
  { id: 4, label: "Foto inicial", icon: Camera },
  { id: 5, label: "Pronto!", icon: PartyPopper },
];

const personalSchema = z.object({
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  birthdate: z.string().min(1, "Data obrigatória"),
  city: z.string().trim().min(2, "Cidade obrigatória").max(80),
  state: z.string().trim().length(2, "UF com 2 letras"),
});

const goalSchema = z.object({
  goal_description: z.string().trim().min(3, "Descreva seu objetivo").max(200),
  goal_weight: z.coerce.number().min(30, "Peso muito baixo").max(300),
  current_weight: z.coerce.number().min(30).max(300),
  height: z.coerce.number().min(100).max(250),
});

interface OnboardingData {
  phone: string; birthdate: string; city: string; state: string;
  goal_description: string; goal_weight: string; current_weight: string; height: string;
  body_fat_percentage: string; muscle_mass: string; visceral_fat: string;
  photo_url: string;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    phone: "", birthdate: "", city: "", state: "",
    goal_description: "", goal_weight: "", current_weight: "", height: "",
    body_fat_percentage: "", muscle_mass: "", visceral_fat: "",
    photo_url: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/login" }); return; }
      const { data: profile } = await supabase.from("profiles").select("id, phone, city, state, birthdate").eq("user_id", user.id).maybeSingle();
      if (!profile) { navigate({ to: "/login" }); return; }
      setProfileId(profile.id);
      setData((d) => ({
        ...d,
        phone: profile.phone || "",
        birthdate: profile.birthdate || "",
        city: profile.city || "",
        state: profile.state || "",
      }));
      const { data: student } = await supabase.from("students").select("id, goal_description, goal_weight, current_weight, height, body_fat_percentage, muscle_mass, visceral_fat").eq("profile_id", profile.id).maybeSingle();
      if (student) {
        setStudentId(student.id);
        setData((d) => ({
          ...d,
          goal_description: student.goal_description || "",
          goal_weight: student.goal_weight?.toString() || "",
          current_weight: student.current_weight?.toString() || "",
          height: student.height?.toString() || "",
          body_fat_percentage: student.body_fat_percentage?.toString() || "",
          muscle_mass: student.muscle_mass?.toString() || "",
          visceral_fat: student.visceral_fat?.toString() || "",
        }));
      }
    };
    init();
  }, [navigate]);

  const update = (k: keyof OnboardingData, v: string) => setData((d) => ({ ...d, [k]: v }));

  const validateAndNext = async () => {
    if (step === 1) {
      const r = personalSchema.safeParse(data);
      if (!r.success) { toast.error(r.error.issues[0].message); return; }
      if (!profileId) return;
      setLoading(true);
      const { error } = await supabase.from("profiles").update({
        phone: data.phone, birthdate: data.birthdate, city: data.city, state: data.state.toUpperCase(),
      }).eq("id", profileId);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
    }
    if (step === 2) {
      const r = goalSchema.safeParse(data);
      if (!r.success) { toast.error(r.error.issues[0].message); return; }
      if (!studentId) { toast.error("Cadastro de aluno não encontrado. Procure seu coach."); return; }
      setLoading(true);
      const { error } = await supabase.from("students").update({
        goal_description: data.goal_description,
        goal_weight: Number(data.goal_weight),
        current_weight: Number(data.current_weight),
        height: Number(data.height),
      }).eq("id", studentId);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
    }
    if (step === 3 && studentId) {
      // bioimpedância é opcional
      setLoading(true);
      const updates: Record<string, number | string> = {};
      if (data.body_fat_percentage) updates.body_fat_percentage = Number(data.body_fat_percentage);
      if (data.muscle_mass) updates.muscle_mass = Number(data.muscle_mass);
      if (data.visceral_fat) updates.visceral_fat = Number(data.visceral_fat);
      if (Object.keys(updates).length) {
        updates.bioimpedance_date = new Date().toISOString().slice(0, 10);
        await supabase.from("students").update(updates).eq("id", studentId);
      }
      setLoading(false);
    }
    if (step === 4 && studentId && data.photo_url) {
      setLoading(true);
      await supabase.from("evolution_photos").insert({
        student_id: studentId,
        photo_url: data.photo_url,
        photo_date: new Date().toISOString().slice(0, 10),
        week_number: 0,
        caption: "Foto inicial",
      });
      setLoading(false);
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const finish = () => navigate({ to: "/student" });

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Progress header */}
      <div className="border-b border-white/5 px-4 py-4 sticky top-0 z-10" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/50">Etapa {step} de 5</span>
            <span className="text-xs font-bold text-primary">{Math.round((step / 5) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-3">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const done = s.id < step;
              const active = s.id === step;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    done ? "bg-primary" : active ? "bg-primary/20 ring-2 ring-primary" : "bg-white/5"
                  }`}>
                    {done ? <Check className="h-3.5 w-3.5 text-primary-foreground" /> : <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-white/30"}`} />}
                  </div>
                  <span className={`text-[9px] ${active ? "text-primary font-bold" : "text-white/30"}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-4 py-8">
        <div className="max-w-md mx-auto">
          {step === 1 && <Step1 data={data} update={update} />}
          {step === 2 && <Step2 data={data} update={update} />}
          {step === 3 && <Step3 data={data} update={update} />}
          {step === 4 && <Step4 data={data} update={update} />}
          {step === 5 && <Step5 />}
        </div>
      </div>

      {/* Footer nav */}
      <div className="border-t border-white/5 px-4 py-4 sticky bottom-0" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="max-w-md mx-auto flex gap-3">
          {step > 1 && step < 5 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          )}
          {step < 5 ? (
            <button
              onClick={validateAndNext}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Próximo <ArrowRight className="h-4 w-4" /></>}
            </button>
          ) : (
            <button
              onClick={finish}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              Começar minha jornada <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step1({ data, update }: { data: OnboardingData; update: (k: keyof OnboardingData, v: string) => void }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Seus dados</h1>
      <p className="text-sm text-white/50 mb-6">Precisamos de algumas informações pra completar seu perfil.</p>
      <div className="space-y-4">
        <FormField label="Telefone (WhatsApp)">
          <Input value={data.phone} onChange={(v) => update("phone", v)} placeholder="(11) 99999-9999" />
        </FormField>
        <FormField label="Data de nascimento">
          <Input type="date" value={data.birthdate} onChange={(v) => update("birthdate", v)} />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FormField label="Cidade">
              <Input value={data.city} onChange={(v) => update("city", v)} placeholder="São Paulo" />
            </FormField>
          </div>
          <FormField label="UF">
            <Input value={data.state} onChange={(v) => update("state", v.toUpperCase().slice(0, 2))} placeholder="SP" />
          </FormField>
        </div>
      </div>
    </>
  );
}

function Step2({ data, update }: { data: OnboardingData; update: (k: keyof OnboardingData, v: string) => void }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Seu objetivo</h1>
      <p className="text-sm text-white/50 mb-6">Vamos te ajudar a chegar onde você quer.</p>
      <div className="space-y-4">
        <FormField label="Qual seu objetivo principal?">
          <textarea
            value={data.goal_description}
            onChange={(e) => update("goal_description", e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Ex: emagrecer 8kg em 3 meses"
            className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Peso atual (kg)">
            <Input type="number" value={data.current_weight} onChange={(v) => update("current_weight", v)} placeholder="80" />
          </FormField>
          <FormField label="Meta (kg)">
            <Input type="number" value={data.goal_weight} onChange={(v) => update("goal_weight", v)} placeholder="72" />
          </FormField>
        </div>
        <FormField label="Altura (cm)">
          <Input type="number" value={data.height} onChange={(v) => update("height", v)} placeholder="175" />
        </FormField>
      </div>
    </>
  );
}

function Step3({ data, update }: { data: OnboardingData; update: (k: keyof OnboardingData, v: string) => void }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Bioimpedância</h1>
      <p className="text-sm text-white/50 mb-6">Opcional — você pode pular e adicionar depois com seu coach.</p>
      <div className="space-y-4">
        <FormField label="% Gordura corporal">
          <Input type="number" value={data.body_fat_percentage} onChange={(v) => update("body_fat_percentage", v)} placeholder="22" />
        </FormField>
        <FormField label="Massa muscular (kg)">
          <Input type="number" value={data.muscle_mass} onChange={(v) => update("muscle_mass", v)} placeholder="32" />
        </FormField>
        <FormField label="Gordura visceral (índice)">
          <Input type="number" value={data.visceral_fat} onChange={(v) => update("visceral_fat", v)} placeholder="8" />
        </FormField>
        <p className="text-[11px] text-white/40 leading-relaxed pt-2">
          💡 Não tem esses dados? Sem problema. Seu coach pode preencher depois durante a primeira avaliação presencial.
        </p>
      </div>
    </>
  );
}

function Step4({ data, update }: { data: OnboardingData; update: (k: keyof OnboardingData, v: string) => void }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Foto inicial</h1>
      <p className="text-sm text-white/50 mb-6">Registre o ponto de partida da sua transformação.</p>
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-8 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          {data.photo_url ? (
            <div className="space-y-3">
              <img src={data.photo_url} alt="Foto inicial" className="rounded-xl mx-auto max-h-48" />
              <button onClick={() => update("photo_url", "")} className="text-xs text-white/50 hover:text-white">Remover</button>
            </div>
          ) : (
            <>
              <Camera className="h-10 w-10 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/70 mb-1">Cole a URL da sua foto</p>
              <p className="text-[11px] text-white/40 mb-4">Em breve: upload direto pela câmera</p>
              <Input
                value={data.photo_url}
                onChange={(v) => update("photo_url", v)}
                placeholder="https://..."
              />
            </>
          )}
        </div>
        <p className="text-[11px] text-white/40 leading-relaxed">
          🔒 Suas fotos são privadas. Apenas você e seu coach têm acesso. Você pode pular essa etapa.
        </p>
      </div>
    </>
  );
}

function Step5() {
  return (
    <div className="text-center py-8">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
        <PartyPopper className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Tudo pronto!</h1>
      <p className="text-sm text-white/50 mb-6 px-4">
        Seu perfil está configurado. Agora é hora de começar o desafio e transformar sua vida.
      </p>
      <div className="rounded-2xl p-5 text-left space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Próximos passos</h3>
        <BulletItem>Acesse seu desafio ativo no app</BulletItem>
        <BulletItem>Registre sua primeira refeição com IA</BulletItem>
        <BulletItem>Entre no chat de grupo do desafio</BulletItem>
        <BulletItem>Acompanhe sua evolução semana a semana</BulletItem>
      </div>
    </div>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
      <span className="text-sm text-white/80">{children}</span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary placeholder:text-white/20"
      style={{ backgroundColor: "#1A1A1A" }}
    />
  );
}
