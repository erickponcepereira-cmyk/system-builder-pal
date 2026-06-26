import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Trash2, GripVertical, Loader2, Camera, Globe, Instagram } from "lucide-react";


interface Props { coachId: string; profileId: string }

type Question = {
  id: string;
  label: string;
  kind: string;
  options: string[];
  position: number;
  is_active: boolean;
};

type SocialLink = { label: string; url: string };

type PublicProfile = {
  headline: string;
  bio_long: string;
  instagram: string;
  website: string;
  social_links: SocialLink[];
  services: string;
  specializations: string[];
  cover_url: string | null;
};

const EMPTY_PROFILE: PublicProfile = {
  headline: "", bio_long: "", instagram: "", website: "", social_links: [], services: "", specializations: [], cover_url: null,
};

export function SettingsTab({ coachId, profileId }: Props) {
  const [tab, setTab] = useState<"profile" | "questions">("profile");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileBio, setProfileBio] = useState("");
  const [pub, setPub] = useState<PublicProfile>(EMPTY_PROFILE);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles").select("avatar_url,bio").eq("id", profileId).maybeSingle();
      setAvatarUrl(prof?.avatar_url || null);
      setProfileBio(prof?.bio || "");

      const { data: pubRow } = await supabase
        .from("professional_public_profile" as never)
        .select("headline,bio_long,instagram,website,social_links,services,specializations,cover_url" as never)
        .eq("profile_id" as never, profileId as never)
        .maybeSingle();
      if (pubRow) {
        const r = pubRow as unknown as PublicProfile;
        setPub({
          headline: r.headline || "",
          bio_long: r.bio_long || "",
          instagram: r.instagram || "",
          website: r.website || "",
          social_links: Array.isArray(r.social_links) ? r.social_links : [],
          services: r.services || "",
          specializations: Array.isArray(r.specializations) ? r.specializations : [],
          cover_url: r.cover_url || null,
        });
      }

      const { data: qs } = await supabase
        .from("professional_anamnesis_questions" as never)
        .select("id,label,kind,options,position,is_active" as never)
        .eq("coach_id" as never, coachId as never)
        .order("position" as never);
      setQuestions((qs as unknown as Question[]) || []);
      setLoading(false);
    })();
  }, [coachId, profileId]);

  const uploadAvatar = async (file: File) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sessão expirada. Faça login novamente.");
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(pub.publicUrl);
    await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", profileId);
    toast.success("Foto atualizada");
  };

  const saveProfile = async () => {
    setSaving(true);
    const { error: e1 } = await supabase.from("profiles").update({ bio: profileBio.slice(0, 2000) }).eq("id", profileId);
    const { error: e2 } = await supabase
      .from("professional_public_profile" as never)
      .upsert({
        profile_id: profileId,
        headline: pub.headline.slice(0, 200) || null,
        bio_long: pub.bio_long.slice(0, 4000) || null,
        instagram: pub.instagram.slice(0, 100) || null,
        website: pub.website.slice(0, 300) || null,
        social_links: pub.social_links,
        services: pub.services.slice(0, 2000) || null,
        specializations: pub.specializations.slice(0, 30).map((t) => t.slice(0, 60)),
      } as never, { onConflict: "profile_id" } as never);
    setSaving(false);
    if (e1 || e2) return toast.error(e1?.message || e2?.message || "Erro ao salvar");
    toast.success("Perfil público salvo");
  };

  const addQuestion = () => {
    setQuestions((qs) => [...qs, {
      id: `new-${Date.now()}`,
      label: "Nova pergunta",
      kind: "text",
      options: [],
      position: qs.length + 1,
      is_active: true,
    }]);
  };

  const updateQuestion = (idx: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const removeQuestion = (idx: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

  const saveQuestions = async () => {
    setSaving(true);
    // Delete all + reinsert with proper positions (simpler than diff)
    await supabase.from("professional_anamnesis_questions" as never).delete().eq("coach_id" as never, coachId as never);
    if (questions.length > 0) {
      const payload = questions.map((q, i) => ({
        coach_id: coachId,
        label: q.label.slice(0, 500),
        kind: q.kind,
        options: q.options || [],
        position: i + 1,
        is_active: q.is_active !== false,
      }));
      const { error } = await supabase.from("professional_anamnesis_questions" as never).insert(payload as never);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    setSaving(false);
    toast.success("Perguntas salvas");
  };

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-white/50">Personalize seu perfil público e as perguntas da anamnese</p>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab("profile")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "profile" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>Perfil público</button>
        <button onClick={() => setTab("questions")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "questions" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>Perguntas da anamnese</button>
      </div>

      {tab === "profile" ? (
        <div className="rounded-2xl p-5 space-y-5" style={{ backgroundColor: "#1A1A1A" }}>
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="Foto" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-white/40" />}
            </div>
            <div>
              <label className="cursor-pointer rounded-lg bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 inline-block">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                Trocar foto
              </label>
              <p className="mt-1 text-[10px] text-white/40">Recomendado: 512×512px (1:1)</p>
            </div>
          </div>

          <Field label="Título / Headline" hint="Aparece ao lado do seu nome (ex: 'Nutricionista Esportiva — Performance & Estética')">
            <input value={pub.headline} onChange={(e) => setPub({ ...pub, headline: e.target.value })} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </Field>

          <Field label="Bio curta">
            <textarea value={profileBio} onChange={(e) => setProfileBio(e.target.value)} rows={2} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </Field>

          <Field label="Sobre o seu trabalho" hint="Texto completo mostrado em produtos da loja">
            <textarea value={pub.bio_long} onChange={(e) => setPub({ ...pub, bio_long: e.target.value })} rows={5} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </Field>

          <Field label="Serviços que você vende">
            <textarea value={pub.services} onChange={(e) => setPub({ ...pub, services: e.target.value })} rows={3} placeholder="Liste seus serviços, programas, pacotes..." className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </Field>

          <Field label="Especializações (tags)" hint="Pressione Enter ou vírgula para adicionar. Aparecem no seu perfil público.">
            <SpecializationsEditor
              value={pub.specializations}
              onChange={(specializations) => setPub({ ...pub, specializations })}
            />
          </Field>


          <div className="grid grid-cols-2 gap-3">
            <Field label="Instagram (@usuario)" icon={<Instagram className="h-3 w-3" />}>
              <input value={pub.instagram} onChange={(e) => setPub({ ...pub, instagram: e.target.value })} placeholder="@seu.handle" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
            <Field label="Site" icon={<Globe className="h-3 w-3" />}>
              <input value={pub.website} onChange={(e) => setPub({ ...pub, website: e.target.value })} placeholder="https://..." className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase text-white/50">Outras redes / links</p>
              <button onClick={() => setPub({ ...pub, social_links: [...pub.social_links, { label: "", url: "" }] })} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {pub.social_links.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input value={s.label} onChange={(e) => setPub({ ...pub, social_links: pub.social_links.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="Nome (ex: TikTok)" className="w-1/3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  <input value={s.url} onChange={(e) => setPub({ ...pub, social_links: pub.social_links.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} placeholder="URL" className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  <button onClick={() => setPub({ ...pub, social_links: pub.social_links.filter((_, j) => j !== i) })} className="rounded-lg bg-red-500/15 px-2 text-red-300 hover:bg-red-500/25"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={saveProfile} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar perfil
          </button>
        </div>
      ) : (
        <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">
            Configure as perguntas que aparecerão na sua anamnese. Se deixar a lista vazia, perguntas padrão serão usadas.
          </p>

          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-white/10 p-3 space-y-2" style={{ backgroundColor: "#0F0F0F" }}>
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-white/30 mt-2" />
                <div className="flex-1 space-y-2">
                  <input value={q.label} onChange={(e) => updateQuestion(i, { label: e.target.value })} placeholder="Pergunta" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  <div className="flex gap-2">
                    <select value={q.kind} onChange={(e) => updateQuestion(i, { kind: e.target.value })} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white outline-none">
                      <option value="text" className="bg-zinc-900">Texto curto</option>
                      <option value="textarea" className="bg-zinc-900">Texto longo</option>
                      <option value="select" className="bg-zinc-900">Lista (escolha única)</option>
                    </select>
                    {q.kind === "select" && (
                      <input
                        value={(q.options || []).join(", ")}
                        onChange={(e) => updateQuestion(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Opções separadas por vírgula"
                        className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-white outline-none"
                      />
                    )}
                    <button onClick={() => removeQuestion(i)} className="rounded-lg bg-red-500/15 px-2 text-red-300 hover:bg-red-500/25"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button onClick={addQuestion} className="w-full rounded-lg border border-dashed border-white/20 px-4 py-2 text-sm text-white/60 hover:bg-white/5 flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar pergunta
          </button>

          <button onClick={saveQuestions} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar perguntas
          </button>
        </div>
      )}
    </>
  );
}

function Field({ label, hint, icon, children }: { label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
        {icon}{label}
      </span>
      {children}
      {hint && <span className="block mt-1 text-[10px] text-white/40">{hint}</span>}
    </label>
  );
}

function SpecializationsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().slice(0, 60);
    if (!t) return;
    if (value.includes(t)) return;
    if (value.length >= 30) return;
    onChange([...value, t]);
    setInput("");
  };
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-primary/70 hover:text-primary">×</button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => input && add(input)}
        placeholder="Ex: Emagrecimento, Hipertrofia, Low Carb..."
        className="w-full bg-transparent text-sm text-white outline-none"
      />
    </div>
  );
}

export default SettingsTab;
