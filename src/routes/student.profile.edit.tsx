import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskPhone } from "@/lib/masks";

export const Route = createFileRoute("/student/profile/edit")({
  head: () => ({
    meta: [
      { title: "Editar perfil — FitMind Club" },
      { name: "description", content: "Atualize seus dados pessoais, foto, contatos e tipo sanguíneo." },
    ],
  }),
  component: EditProfilePage,
});

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  profession: string;
  instagram: string;
  gender: "M" | "F" | "O" | "";
  blood_type: string;
  birthdate: string;
  bio: string;
  photo_url: string;
};

const empty: ProfileForm = {
  name: "", email: "", phone: "", profession: "",
  instagram: "", gender: "", blood_type: "", birthdate: "", bio: "", photo_url: "",
};

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS: ReadonlyArray<["M" | "F" | "O", string]> = [["M","Masculino"],["F","Feminino"],["O","Outro"]];

function EditProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      setUserId(userData.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email,phone,profession,instagram,blood_type,birthdate,bio,photo_url,gender" as never)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (data) {
        const d = data as unknown as Record<string, string | null>;
        setProfileId(d.id as string);
        const g = (d.gender || "") as string;
        setForm({
          name: d.name || "",
          email: d.email || "",
          phone: d.phone || "",
          profession: d.profession || "",
          instagram: d.instagram || "",
          gender: (g === "M" || g === "F" || g === "O") ? g : "",
          blood_type: d.blood_type || "",
          birthdate: d.birthdate || "",
          bio: d.bio || "",
          photo_url: d.photo_url || "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((c) => ({ ...c, [key]: value }));

  const handlePhoto = async (file: File) => {
    if (!userId) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Foto deve ter no máximo 5MB");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    update("photo_url", pub.publicUrl);
    setUploading(false);
    toast.success("Foto carregada — não esqueça de salvar");
  };

  const save = async () => {
    if (!profileId) return toast.error("Perfil não encontrado");
    if (!form.name.trim()) return toast.error("Informe seu nome");
    if (!form.email.includes("@")) return toast.error("E-mail inválido");
    setSaving(true);
    const newEmail = form.email.trim().toLowerCase();
    const { data: userData } = await supabase.auth.getUser();
    const currentEmail = (userData.user?.email || "").toLowerCase();
    if (newEmail && newEmail !== currentEmail) {
      const { error: authErr } = await supabase.auth.updateUser({ email: newEmail });
      if (authErr) { setSaving(false); return toast.error(`Não foi possível atualizar e-mail: ${authErr.message}`); }
      toast.message("Confirme o novo e-mail na sua caixa de entrada para concluir a troca.");
    }
    const { error } = await supabase.from("profiles").update({
      name: form.name.trim().slice(0, 255),
      email: newEmail,
      phone: form.phone.slice(0, 20) || null,
      profession: form.profession.trim().slice(0, 100) || null,
      instagram: form.instagram.trim().replace(/^@/, "").slice(0, 100) || null,
      gender: form.gender || null,
      blood_type: form.blood_type || null,
      birthdate: form.birthdate || null,
      bio: form.bio.trim().slice(0, 500) || null,
      photo_url: form.photo_url || null,
    } as never).eq("id", profileId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado!");
    navigate({ to: "/student/profile" });
  };

  if (loading) return <div className="p-4 text-sm text-white/60">Carregando...</div>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Conta</p>
          <h1 className="text-2xl font-bold text-white">Editar perfil</h1>
        </div>
      </header>

      {/* Avatar */}
      <div className="rounded-2xl p-5 flex flex-col items-center gap-3" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/40 overflow-hidden">
            {form.photo_url ? (
              <img src={form.photo_url} alt={form.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{form.name.charAt(0) || "?"}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary border-2 disabled:opacity-60"
            style={{ borderColor: "#1A1A1A" }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : <Camera className="h-4 w-4 text-primary-foreground" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
          />
        </div>
        <p className="text-[11px] text-white/40">Toque na câmera para trocar a foto · Recomendado: 512×512px (1:1)</p>
      </div>

      {/* Form */}
      <section className="space-y-3 rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <Field label="Nome completo">
          <input value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={120} className="field-control" />
        </Field>

        <Field label="E-mail">
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={255} className="field-control" />
          <span className="mt-1 block text-[10px] text-white/40">Alterar o e-mail exige confirmação no novo endereço.</span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="WhatsApp">
            <input value={form.phone} onChange={(e) => update("phone", maskPhone(e.target.value))} placeholder="(11) 99999-9999" className="field-control" />
          </Field>
          <Field label="Data de nascimento">
            <input type="date" value={form.birthdate} onChange={(e) => update("birthdate", e.target.value)} className="field-control" />
          </Field>
        </div>

        <Field label="Gênero">
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => update("gender", form.gender === v ? "" : v)}
                className={`rounded-xl py-2 text-sm font-semibold transition-colors ${form.gender === v ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Profissão">
          <input value={form.profession} onChange={(e) => update("profession", e.target.value)} maxLength={100} placeholder="Ex: Designer, Médico..." className="field-control" />
        </Field>

        <Field label="Instagram">
          <input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} maxLength={100} placeholder="@seuusuario" className="field-control" />
        </Field>

        <Field label="Tipo sanguíneo">
          <div className="grid grid-cols-4 gap-2">
            {BLOOD_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => update("blood_type", form.blood_type === bt ? "" : bt)}
                className={`rounded-xl py-2 text-sm font-bold transition-colors ${
                  form.blood_type === bt ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70"
                }`}
              >
                {bt}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Bio">
          <textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} maxLength={500} rows={3} placeholder="Conte um pouco sobre você..." className="field-control" />
        </Field>

        <button
          onClick={save}
          disabled={saving}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}
