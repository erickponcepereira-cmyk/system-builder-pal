import { useEffect, useRef, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  User, Save, Mail, Phone, MapPin, Trophy, Award, UserRound,
  History, Camera, GraduationCap, Activity, Instagram, Globe, Youtube, Facebook, Music2, Package,
  Medal, Shield, Sparkles,
} from "lucide-react";
import { money, type CoachContext } from "@/routes/_authenticated/coach";
import { TopSellingProducts } from "@/components/coach/TopSellingProducts";
import { BadgeImage } from "@/components/coach/BadgeImage";
import { getCoachProfileSummary, type ActivityItemRow, type CoachProfileSummary } from "@/lib/coach-profile-summary.functions";

const EMPTY_SUMMARY: CoachProfileSummary = {
  coachId: null, totalActiveStudents: 0, totalSales: 0,
  studentsBrought: [], studentsWinners: [], coachesTrained: [],
  eventsMinistered: [], classesMinistered: [],
  currentPatent: null, currentMedal: null, enabledCategories: [],
};

export function CoachProfileTab({ coach, onSaved, onLocalChange }: { coach: CoachContext | null; onSaved: () => void; onLocalChange: (value: CoachContext | null) => void }) {
  const [form, setForm] = useState({
    name: "", phone: "", city: "", state: "", bio: "", pix_key: "", pix_key_type: "cpf",
    instagram: "", facebook: "", youtube: "", tiktok: "", website: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeView, setActiveView] = useState<"profile" | "top">("profile");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchSummary = useServerFn(getCoachProfileSummary);
  const [summary, setSummary] = useState<CoachProfileSummary>(EMPTY_SUMMARY);
  const [modal, setModal] = useState<{ title: string; rows: ActivityItemRow[] } | null>(null);

  useEffect(() => {
    if (!coach) return;
    (async () => {
      try { setSummary(await fetchSummary()); } catch { /* silent */ }
    })();
  }, [coach, fetchSummary]);

  useEffect(() => {
    if (!coach) return;
    (async () => {
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

  const activeStudents = summary.totalActiveStudents || coach?.totalActiveStudents || 0;
  const totalSales = summary.totalSales || coach?.totalSales || 0;

  const activityHistory = useMemo(() => ([
    { key: "brought", icon: UserRound, label: "Alunos trazidos", value: summary.studentsBrought.length, detail: "Alunos diretos cadastrados na sua rede", rows: summary.studentsBrought },
    { key: "winners", icon: Award, label: "Alunos vencedores de desafio", value: summary.studentsWinners.length, detail: "Seus alunos premiados em desafios oficiais", rows: summary.studentsWinners },
    { key: "events", icon: Activity, label: "Eventos ministrados", value: summary.eventsMinistered.length, detail: "Eventos FitMind sob sua responsabilidade", rows: summary.eventsMinistered },
    { key: "classes", icon: GraduationCap, label: "Turmas ministradas", value: summary.classesMinistered.length, detail: "Turmas de formação de coach que você ministrou", rows: summary.classesMinistered },
    { key: "coaches", icon: Trophy, label: "Coaches treinados", value: summary.coachesTrained.length, detail: "Diretos da sua rede que evoluíram para coach", rows: summary.coachesTrained },
  ]), [summary]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
          <p className="text-sm text-white/50">Informações do coach, foto e histórico</p>
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <button onClick={() => setActiveView("profile")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeView === "profile" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}>
            <User className="h-3.5 w-3.5" /> Perfil
          </button>
          <button onClick={() => setActiveView("top")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeView === "top" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}>
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
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50" title="Trocar foto">
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </div>
          <h2 className="text-lg font-bold text-white">{coach?.name || "Coach"}</h2>
          <p className="text-[10px] text-white/40">Foto recomendada: 512×512px (1:1)</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50"><Mail className="h-3 w-3" />{coach?.email || "E-mail não informado"}</p>

          {/* Patente e medalha em destaque */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-2.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                {summary.currentPatent?.image_url ? (
                  <BadgeImage path={summary.currentPatent.image_url} alt={summary.currentPatent.name} className="h-12 w-12 object-contain" />
                ) : (
                  <Shield className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-primary/80">Patente atual</p>
                <p className="truncate text-xs font-bold text-white">{summary.currentPatent?.name || "Sem patente"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-2.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                {summary.currentMedal?.image_url ? (
                  <BadgeImage path={summary.currentMedal.image_url} alt={summary.currentMedal.name} className="h-12 w-12 object-contain" />
                ) : (
                  <Medal className="h-6 w-6 text-amber-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-amber-300/80">Medalha atual</p>
                <p className="truncate text-xs font-bold text-white">{summary.currentMedal?.name || "Sem medalha"}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Alunos ativos</p><p className="text-lg font-bold text-white">{activeStudents}</p></div>
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Vendas</p><p className="text-lg font-bold text-white">{money(totalSales)}</p></div>
          </div>
          <div className="mt-3 rounded-xl bg-black/20 p-3"><p className="text-[10px] uppercase text-white/35">Código</p><p className="font-mono text-sm font-bold text-primary">{coach?.referralCode || "—"}</p></div>

          {/* Categorias habilitadas */}
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
              <Sparkles className="h-3 w-3" /> Categorias habilitadas
            </p>
            {summary.enabledCategories.length === 0 ? (
              <p className="text-xs text-white/40">Nenhuma categoria habilitada ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {summary.enabledCategories.map((c) => (
                  <span key={c.key} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Histórico de atividades */}
      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-white">Histórico de atividades</h2>
            <p className="text-xs text-white/45">Clique em um card para ver o detalhe</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activityHistory.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setModal({ title: item.label, rows: item.rows })}
                className="rounded-xl border border-white/5 p-4 text-left transition hover:border-primary/40 hover:bg-white/5"
                style={{ backgroundColor: "#0F0F0F" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="text-xs text-white/50">{item.label}</p>
                </div>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="mt-1 text-[11px] text-white/40">{item.detail}</p>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!modal} onOpenChange={(open) => { if (!open) setModal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal?.title}</DialogTitle>
          </DialogHeader>
          {!modal || modal.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/50">Nenhum registro ainda.</p>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {modal.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{r.title}</p>
                    {r.subtitle && <p className="truncate text-[11px] text-white/50">{r.subtitle}</p>}
                  </div>
                  {r.date && (
                    <span className="shrink-0 text-[11px] text-white/40">{new Date(r.date).toLocaleDateString("pt-BR")}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </>
      )}
    </>
  );
}

export default CoachProfileTab;
