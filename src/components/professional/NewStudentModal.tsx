import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  coachId: string;
  onClose: () => void;
  onCreated: () => void;
}

const SKIN_COLORS = [
  { value: "white", label: "Branca" },
  { value: "black", label: "Preta" },
  { value: "hispanic", label: "Parda" },
  { value: "asian", label: "Amarela" },
  { value: "indigenous", label: "Indígena" },
  { value: "other", label: "Outra" },
];

const GENDERS = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
  { value: "other", label: "Outro" },
];

export function NewStudentModal({ coachId, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    age: "",
    phone: "",
    height: "",
    weight: "",
    gender: "female",
    skin: "white",
  });

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome");
    setSaving(true);
    // derive birth_date from age (Jan 1 of birth year)
    let birthDate: string | null = null;
    const ageNum = parseInt(form.age, 10);
    if (Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130) {
      const y = new Date().getFullYear() - ageNum;
      birthDate = `${y}-01-01`;
    }
    const { error } = await supabase.from("coach_evaluation_clients" as never).insert({
      coach_id: coachId,
      name: form.name.trim().slice(0, 120),
      gender: form.gender,
      ethnicity: form.skin,
      height: form.height ? Number(form.height) : null,
      height_unit: "cm",
      current_weight: form.weight ? Number(form.weight) : null,
      birth_date: birthDate,
      whatsapp: form.phone.trim() || null,
      language: "pt",
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message || "Erro ao cadastrar");
    toast.success("Aluno cadastrado");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-white/10 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Novo aluno</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nome completo *">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Idade">
              <input value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} placeholder="ex: 32" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
            <Field label="Telefone">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-0000" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
            <Field label="Altura (cm)">
              <input value={form.height} onChange={(e) => set("height", e.target.value.replace(/[^\d.]/g, ""))} placeholder="170" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
            <Field label="Peso (kg)">
              <input value={form.weight} onChange={(e) => set("weight", e.target.value.replace(/[^\d.]/g, ""))} placeholder="70" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </Field>
            <Field label="Sexo">
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none">
                {GENDERS.map((g) => <option key={g.value} value={g.value} className="bg-zinc-900">{g.label}</option>)}
              </select>
            </Field>
            <Field label="Cor da pele">
              <select value={form.skin} onChange={(e) => set("skin", e.target.value)} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none">
                {SKIN_COLORS.map((s) => <option key={s.value} value={s.value} className="bg-zinc-900">{s.label}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Cadastrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default NewStudentModal;
