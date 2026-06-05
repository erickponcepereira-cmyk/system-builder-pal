import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  User, Save, Mail, Phone, MapPin, BookOpen, Trophy, Award, UserRound,
  History, Camera, GraduationCap, Activity, Instagram, Globe, Youtube, Facebook, Music2, Package,
} from "lucide-react";
import { money, type CoachContext } from "@/routes/coach";
import { TopSellingProducts } from "@/components/coach/TopSellingProducts";
import { getCoachMinisteredReport } from "@/lib/fitmind-events.functions";



export function CoachProfileTab({ coach, onSaved, onLocalChange }: { coach: CoachContext | null; onSaved: () => void; onLocalChange: (value: CoachContext | null) => void }) {
  const [form, setForm] = useState({
    name: "", phone: "", city: "", state: "", bio: "", pix_key: "", pix_key_type: "cpf",
    instagram: "", facebook: "", youtube: "", tiktok: "", website: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeView, setActiveView] = useState<"profile" | "top">("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchMinistered = useServerFn(getCoachMinisteredReport);
  const [ministered, setMinistered] = useState<{ count: number; lastTitle: string | null; lastDate: string | null; attendeesTotal: number }>({ count: 0, lastTitle: null, lastDate: null, attendeesTotal: 0 });

  useEffect(() => {
    if (!coach) return;
    (async () => {
      try {
        const r = await fetchMinistered({ data: {} });
        setMinistered({
          count: r.summary.events_count,
          lastTitle: r.summary.last_event?.title || null,
          lastDate: r.summary.last_event?.starts_at || null,
          attendeesTotal: r.summary.attendees_total,
        });
      } catch { /* silent */ }
    })();
  }, [coach, fetchMinistered]);


  

  useEffect(() => {
    if (!coach) return;
    (async () => {
      // Carrega campos sociais do coach
      const { data } = await supabase.from("coaches")
        .select("instagram,facebook,youtube,tiktok,website,pix_key,pix_key_type")
        .eq("id", coach.coachId).maybeSingle();
      const d = (data as any) || {};
      setForm((current) => ({
        ...current,
        name: coach.name, phone: coach.phone, city: coach.city, state: coach.state, bio: coach.bio,
        pix_key: d.pix_key || "", pix_key_type: d.pix_key_type || "cpf",
        instagram: d.instagram || "", facebook: d.facebook || "", youtube: d.youtube || "",
        tiktok: d.tiktok || "", website: d.website || "",
      }));
    })();
  }, [coach]);

  const save = async () => {
    if (!coach) return;
    if (!form.name.trim()) return toast.error("Informe seu nome para salvar o perfil");
    setSaving(true);
    const { error: profileError } = await supabase.from("profiles").update({ name: form.name.trim(), phone: form.phone.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null, bio: form.bio.trim() || null }).eq("id", coach.profileId);
    const { error: coachError } = await supabase.from("coaches").update({
      pix_key: form.pix_key.trim() || null, pix_key_type: form.pix_key_type || null,
      instagram: form.instagram.trim() || null, facebook: form.facebook.trim() || null,
      youtube: form.youtube.trim() || null, tiktok: form.tiktok.trim() || null,
      website: form.website.trim() || null,
    } as never).eq("id", coach.coachId);
    setSaving(false);
    if (profileError || coachError) return toast.error("Não foi possível salvar. Verifique os dados e tente novamente.");
    onLocalChange({ ...coach, name: form.name.trim(), phone: form.phone.trim(), city: form.city.trim(), state: form.state.trim(), bio: form.bio.trim() });
    toast.success("Perfil atualizado");
    onSaved();
  };


  const uploadAvatar = async (file: File) => {
    if (!coach) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem deve ter até 5MB");
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setUploading(false); return toast.error("Sessão inválida"); }
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setUploading(false); return toast.error("Erro ao enviar foto"); }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", coach.profileId);
    setUploading(false);
    if (updErr) return toast.error("Erro ao salvar foto no perfil");
    onLocalChange({ ...coach, avatarUrl: url });
    toast.success("Foto atualizada");
    onSaved();
  };

  // Mock activity history
  const activityHistory = [
    { icon: Trophy, label: "Desafios participados", value: 4, detail: "Verão Shape, Setembro Fit, Inverno Pro, Reset 30D" },
    { icon: Award, label: "Alunos vencedores de desafio", value: 12, detail: "Levou 12 alunos até a vitória em desafios oficiais" },
    { icon: UserRound, label: "Alunos trazidos", value: coach?.totalActiveStudents || 24, detail: "Alunos diretos cadastrados na sua rede" },
    {
      icon: Activity,
      label: "Eventos ministrados",
      value: ministered.count,
      detail: ministered.lastTitle
        ? `Última edição: ${ministered.lastTitle}${ministered.lastDate ? " • " + new Date(ministered.lastDate).toLocaleDateString("pt-BR") : ""} · ${ministered.attendeesTotal} presenças totais`
        : "Você ainda não foi responsável por nenhum evento FitMind.",
    },
    { icon: BookOpen, label: "Cursos criados", value: 2, detail: "Treino Funcional Iniciante, Mentoria Coach 360" },
    { icon: GraduationCap, label: "Coaches treinados", value: 5, detail: "Diretos da sua rede que evoluíram para coach" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
          <p className="text-sm text-white/50">Informações do coach, foto e histórico</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setActiveView("profile")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeView === "profile" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
          >
            <User className="h-3.5 w-3.5" /> Perfil
          </button>
          <button
            onClick={() => setActiveView("top")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeView === "top" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
          >
            <Package className="h-3.5 w-3.5" /> Produtos mais vendidos
          </button>
        </div>
      </div>

      {activeView === "top" ? (
        <TopSellingProducts coachProfileId={coach?.profileId || null} />
      ) : (
      <>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">

        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ key: "name", label: "Nome", icon: User }, { key: "phone", label: "Telefone", icon: Phone }, { key: "city", label: "Cidade", icon: MapPin }, { key: "state", label: "Estado", icon: MapPin }].map((field) => {
              const Icon = field.icon;
              return <label key={field.key} className="text-xs text-white/50"><span className="mb-1 flex items-center gap-1.5"><Icon className="h-3 w-3" />{field.label}</span><input className="field-control" value={form[field.key as keyof typeof form]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} /></label>;
            })}
            <label className="sm:col-span-2 text-xs text-white/50"><span className="mb-1 block">Bio / apresentação</span><textarea className="field-control min-h-28" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Conte sua especialidade, cidade de atendimento e foco de transformação." /></label>
            <label className="text-xs text-white/50"><span className="mb-1 block">Tipo de chave PIX</span><select className="field-control" value={form.pix_key_type} onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })}><option value="cpf">CPF</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></label>
            <label className="text-xs text-white/50"><span className="mb-1 block">Chave PIX</span><input className="field-control" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></label>
          </div>
          <div className="mt-5 border-t border-white/5 pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/60">Redes sociais</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@seuusuario" },
                { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "facebook.com/voce" },
                { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "youtube.com/@canal" },
                { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "@seuusuario" },
                { key: "website", label: "Site / link na bio", icon: Globe, placeholder: "https://..." },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <label key={f.key} className="text-xs text-white/50">
                    <span className="mb-1 flex items-center gap-1.5"><Icon className="h-3 w-3" />{f.label}</span>
                    <input className="field-control" placeholder={f.placeholder} value={form[f.key as keyof typeof form]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  </label>
                );
              })}
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="mt-4"><Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar perfil"}</Button>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="relative mb-4 h-20 w-20">
            {coach?.avatarUrl ? (
              <img src={coach.avatarUrl} alt={coach.name} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary">{(coach?.name || "C").charAt(0)}</div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              title="Trocar foto"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
            />
          </div>
          <h2 className="text-lg font-bold text-white">{coach?.name || "Coach"}</h2>
          <p className="text-[10px] text-white/40">Foto recomendada: 512×512px (1:1)</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50"><Mail className="h-3 w-3" />{coach?.email || "E-mail não informado"}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Alunos ativos</p><p className="text-lg font-bold text-white">{coach?.totalActiveStudents || 0}</p></div>
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Vendas</p><p className="text-lg font-bold text-white">{money(coach?.totalSales)}</p></div>
          </div>
          <div className="mt-3 rounded-xl bg-black/20 p-3"><p className="text-[10px] uppercase text-white/35">Código</p><p className="font-mono text-sm font-bold text-primary">{coach?.referralCode || "—"}</p></div>
        </div>
      </div>

      {/* Histórico de atividades */}
      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-white">Histórico de atividades</h2>
            <p className="text-xs text-white/45">Visualização rápida da sua trajetória como coach (dados de demonstração)</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activityHistory.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="text-xs text-white/50">{item.label}</p>
                </div>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="mt-1 text-[11px] text-white/40">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </>
  );

}

export default CoachProfileTab;
