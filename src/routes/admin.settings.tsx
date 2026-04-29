import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, BookOpenCheck, MessageCircle, Plane, Plus, Quote, Save, Settings2, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

type CareerPlan = {
  id: string;
  name: string;
  description: string | null;
  duration_months: number | null;
  min_monthly_students: number | null;
  must_be_top_seller: boolean | null;
  reward_value: number | null;
  reward_description: string | null;
  reward_details: string | null;
  is_active: boolean | null;
};

type AppSettings = {
  support_whatsapp: string;
  support_email: string;
  referral_commission_percentage: string;
  student_min_withdrawal: string;
  attendance_goal_percentage: string;
  daily_motivation_enabled: string;
  push_reminder_time: string;
  coach_course_enabled: string;
};

type QuoteRow = { id: string; quote: string; author: string | null; category: string | null; is_active: boolean | null };
type ModuleRow = { id: string; title: string; description: string | null; video_url: string | null; duration_minutes: number | null; sort_order: number | null; is_required: boolean | null; is_active: boolean | null };

const DEFAULT_SETTINGS: AppSettings = {
  support_whatsapp: "",
  support_email: "suporte@fitmindclub.com",
  referral_commission_percentage: "50",
  student_min_withdrawal: "50",
  attendance_goal_percentage: "80",
  daily_motivation_enabled: "true",
  push_reminder_time: "08:00",
  coach_course_enabled: "true",
};

function AdminSettings() {
  const [plan, setPlan] = useState<CareerPlan | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuote, setNewQuote] = useState({ quote: "", author: "FitMind Club", category: "general" });
  const [newModule, setNewModule] = useState({ title: "", description: "", video_url: "", duration_minutes: 10, sort_order: 1 });

  const enabledQuotes = useMemo(() => quotes.filter((item) => item.is_active !== false).length, [quotes]);
  const requiredModules = useMemo(() => modules.filter((item) => item.is_active !== false && item.is_required !== false).length, [modules]);

  const load = async () => {
    setLoading(true);
    const [planRes, settingsRes, quotesRes, modulesRes] = await Promise.all([
      supabase.from("career_plan_config").select("*").eq("is_active", true).limit(1).maybeSingle(),
      supabase.from("app_settings").select("key,value"),
      supabase.from("motivational_quotes" as never).select("id,quote,author,category,is_active" as never).order("created_at" as never, { ascending: false }).limit(30),
      supabase.from("coach_course_modules" as never).select("id,title,description,video_url,duration_minutes,sort_order,is_required,is_active" as never).order("sort_order" as never),
    ]);

    setPlan((planRes.data as CareerPlan) || {
      id: "",
      name: "Plano de Carreira",
      description: "Recompensa para coaches que mantêm rede ativa",
      duration_months: 6,
      min_monthly_students: 100,
      must_be_top_seller: true,
      reward_value: 6000,
      reward_description: "Viagem com tudo pago",
      reward_details: "Viagem ao Nordeste 🌴",
      is_active: true,
    });

    const loaded = { ...DEFAULT_SETTINGS };
    ((settingsRes.data as Array<{ key: string; value: string | null }>) || []).forEach((item) => {
      if (item.key in loaded) loaded[item.key as keyof AppSettings] = item.value || "";
    });
    setSettings(loaded);
    setQuotes((quotesRes.data as unknown as QuoteRow[]) || []);
    setModules((modulesRes.data as unknown as ModuleRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveSetting = async (key: keyof AppSettings, value: string) => {
    const { data } = await supabase.from("app_settings").select("id").eq("key", key).maybeSingle();
    if (data?.id) {
      return supabase.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("id", data.id);
    }
    return supabase.from("app_settings").insert({ key, value, description: settingDescriptions[key] } as never);
  };

  const saveAll = async () => {
    if (!plan) return;
    setSaving(true);
    let error = null;
    if (plan.id) {
      ({ error } = await supabase.from("career_plan_config").update({
        name: plan.name,
        description: plan.description,
        duration_months: plan.duration_months,
        min_monthly_students: plan.min_monthly_students,
        must_be_top_seller: plan.must_be_top_seller,
        reward_value: plan.reward_value,
        reward_description: plan.reward_description,
        reward_details: plan.reward_details,
      }).eq("id", plan.id));
    } else {
      const { id, ...payload } = plan;
      void id;
      ({ error } = await supabase.from("career_plan_config").insert(payload as never));
    }

    if (!error) {
      for (const [key, value] of Object.entries(settings) as Array<[keyof AppSettings, string]>) {
        const result = await saveSetting(key, value);
        if (result.error) { error = result.error; break; }
      }
    }

    setSaving(false);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Configurações salvas"); await load(); }
  };

  const addQuote = async () => {
    if (newQuote.quote.trim().length < 8) return toast.error("Informe a frase motivacional");
    const { error } = await supabase.from("motivational_quotes" as never).insert({ ...newQuote, is_active: true } as never);
    if (error) toast.error(error.message);
    else { toast.success("Frase adicionada"); setNewQuote({ quote: "", author: "FitMind Club", category: "general" }); await load(); }
  };

  const toggleQuote = async (quote: QuoteRow) => {
    const { error } = await supabase.from("motivational_quotes" as never).update({ is_active: !quote.is_active } as never).eq("id" as never, quote.id as never);
    if (error) toast.error(error.message); else await load();
  };

  const addModule = async () => {
    if (newModule.title.trim().length < 3) return toast.error("Informe o título do módulo");
    const { error } = await supabase.from("coach_course_modules" as never).insert({ ...newModule, is_required: true, is_active: true } as never);
    if (error) toast.error(error.message);
    else { toast.success("Módulo criado"); setNewModule({ title: "", description: "", video_url: "", duration_minutes: 10, sort_order: modules.length + 1 }); await load(); }
  };

  const toggleModule = async (module: ModuleRow) => {
    const { error } = await supabase.from("coach_course_modules" as never).update({ is_active: !module.is_active } as never).eq("id" as never, module.id as never);
    if (error) toast.error(error.message); else await load();
  };

  if (loading || !plan) return <p className="text-white/50">Carregando configurações...</p>;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-sm text-white/50">Parâmetros globais, notificações, curso de coach e carreira</p>
        </div>
        <Button onClick={saveAll} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar tudo"}</Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Frases ativas" value={String(enabledQuotes)} />
        <Metric label="Módulos obrigatórios" value={String(requiredModules)} />
        <Metric label="Saque mínimo" value={`R$ ${Number(settings.student_min_withdrawal || 0).toFixed(0)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5">
          <Section icon={Settings2} title="Parâmetros do aplicativo">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="WhatsApp de suporte"><Input value={settings.support_whatsapp} onChange={(v) => setSettings({ ...settings, support_whatsapp: v })} placeholder="5599999999999" /></Field>
              <Field label="E-mail de suporte"><Input value={settings.support_email} onChange={(v) => setSettings({ ...settings, support_email: v })} /></Field>
              <Field label="Comissão aluno indicador (%)"><Input type="number" value={settings.referral_commission_percentage} onChange={(v) => setSettings({ ...settings, referral_commission_percentage: v })} /></Field>
              <Field label="Saque mínimo aluno (R$)"><Input type="number" value={settings.student_min_withdrawal} onChange={(v) => setSettings({ ...settings, student_min_withdrawal: v })} /></Field>
              <Field label="Meta de frequência (%)"><Input type="number" value={settings.attendance_goal_percentage} onChange={(v) => setSettings({ ...settings, attendance_goal_percentage: v })} /></Field>
              <Field label="Horário lembrete push"><Input type="time" value={settings.push_reminder_time} onChange={(v) => setSettings({ ...settings, push_reminder_time: v })} /></Field>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Toggle label="Frase motivacional diária" checked={settings.daily_motivation_enabled === "true"} onChange={(checked) => setSettings({ ...settings, daily_motivation_enabled: String(checked) })} />
              <Toggle label="Curso Quero ser Coach" checked={settings.coach_course_enabled === "true"} onChange={(checked) => setSettings({ ...settings, coach_course_enabled: String(checked) })} />
            </div>
          </Section>

          <Section icon={Plane} title="Plano de carreira">
            <div className="space-y-3">
              <Field label="Nome"><Input value={plan.name} onChange={(v) => setPlan({ ...plan, name: v })} /></Field>
              <Field label="Descrição"><Textarea value={plan.description || ""} onChange={(v) => setPlan({ ...plan, description: v })} rows={2} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Meses consecutivos"><Input type="number" value={plan.duration_months || 6} onChange={(v) => setPlan({ ...plan, duration_months: Number(v) })} /></Field>
                <Field label="Mínimo alunos/mês"><Input type="number" value={plan.min_monthly_students || 100} onChange={(v) => setPlan({ ...plan, min_monthly_students: Number(v) })} /></Field>
                <Field label="Valor recompensa (R$)"><Input type="number" value={plan.reward_value || 0} onChange={(v) => setPlan({ ...plan, reward_value: Number(v) })} /></Field>
                <Field label="Resumo recompensa"><Input value={plan.reward_description || ""} onChange={(v) => setPlan({ ...plan, reward_description: v })} /></Field>
              </div>
              <Field label="Detalhes da recompensa"><Textarea value={plan.reward_details || ""} onChange={(v) => setPlan({ ...plan, reward_details: v })} rows={2} /></Field>
              <Toggle label="Exigir top vendedor da unidade" checked={!!plan.must_be_top_seller} onChange={(checked) => setPlan({ ...plan, must_be_top_seller: checked })} />
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section icon={Quote} title="Frases motivacionais">
            <div className="space-y-2 rounded-xl bg-white/5 p-3">
              <Textarea value={newQuote.quote} onChange={(v) => setNewQuote({ ...newQuote, quote: v })} placeholder="Nova frase do dia" rows={2} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input value={newQuote.author} onChange={(v) => setNewQuote({ ...newQuote, author: v })} placeholder="Autor" />
                <Button onClick={addQuote} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Adicionar</Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {quotes.slice(0, 6).map((quote) => <ListItem key={quote.id} title={quote.quote} subtitle={quote.author || "FitMind Club"} active={quote.is_active !== false} onToggle={() => toggleQuote(quote)} />)}
            </div>
          </Section>

          <Section icon={BookOpenCheck} title="Módulos da formação Coach">
            <div className="space-y-2 rounded-xl bg-white/5 p-3">
              <Input value={newModule.title} onChange={(v) => setNewModule({ ...newModule, title: v })} placeholder="Título do módulo" />
              <Textarea value={newModule.description} onChange={(v) => setNewModule({ ...newModule, description: v })} placeholder="Descrição" rows={2} />
              <div className="grid grid-cols-[1fr_88px_auto] gap-2">
                <Input value={newModule.video_url} onChange={(v) => setNewModule({ ...newModule, video_url: v })} placeholder="Link da aula" />
                <Input type="number" value={newModule.duration_minutes} onChange={(v) => setNewModule({ ...newModule, duration_minutes: Number(v) })} />
                <Button onClick={addModule} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Criar</Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {modules.map((module) => <ListItem key={module.id} title={module.title} subtitle={`${module.duration_minutes || 10} min · ordem ${module.sort_order || 0}`} active={module.is_active !== false} onToggle={() => toggleModule(module)} />)}
            </div>
          </Section>

          <Section icon={Bell} title="Canais ativos">
            <div className="grid gap-2">
              <Channel icon={MessageCircle} title="Suporte do aluno" value={settings.support_whatsapp || settings.support_email || "Não configurado"} />
              <Channel icon={Bell} title="Notificações internas" value={settings.daily_motivation_enabled === "true" ? "Ativas" : "Pausadas"} />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

const settingDescriptions: Record<keyof AppSettings, string> = {
  support_whatsapp: "WhatsApp exibido na central de ajuda do aluno",
  support_email: "E-mail exibido na central de ajuda do aluno",
  referral_commission_percentage: "Percentual padrão de comissão do aluno indicador",
  student_min_withdrawal: "Valor mínimo para saque de indicação do aluno",
  attendance_goal_percentage: "Meta de frequência usada na interface do aluno",
  daily_motivation_enabled: "Controla exibição de frases motivacionais diárias",
  push_reminder_time: "Horário preferencial para lembretes de check-in",
  coach_course_enabled: "Controla disponibilidade da formação Quero ser Coach",
};

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><div className="mb-4 flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15"><Icon className="h-4 w-4 text-primary" /></div><h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2></div>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-white/40">{label}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-[11px] text-white/60">{label}</label>{children}</div>; }
function Input(props: { value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <input type={props.type || "text"} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} className="field-control" />; }
function Textarea(props: { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) { return <textarea value={props.value} rows={props.rows || 3} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} className="field-control" />; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/5 p-3"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" /><span className="text-sm text-white">{label}</span></label>; }
function ListItem({ title, subtitle, active, onToggle }: { title: string; subtitle: string; active: boolean; onToggle: () => void }) { return <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{title}</p><p className="truncate text-[10px] text-white/40">{subtitle}</p></div><button onClick={onToggle} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${active ? "bg-success/20 text-success" : "bg-white/10 text-white/40"}`}>{active ? "Ativo" : "Inativo"}</button></div>; }
function Channel({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) { return <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><Icon className="h-4 w-4 text-primary" /><div className="min-w-0"><p className="text-xs font-bold text-white">{title}</p><p className="truncate text-[11px] text-white/45">{value}</p></div></div>; }
