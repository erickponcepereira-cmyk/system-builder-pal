import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Search, ClipboardList, Loader2 } from "lucide-react";

interface Props { coachId: string }

type Client = { id: string; name: string; whatsapp: string | null; email: string | null };
type Question = { id: string; label: string; kind: string; options: string[]; position: number };

const DEFAULT_QUESTIONS: Question[] = [
  { id: "_d1", label: "Tem alguma doença pré-existente? Quais?", kind: "textarea", options: [], position: 1 },
  { id: "_d2", label: "Faz uso de medicação contínua? Quais?", kind: "textarea", options: [], position: 2 },
  { id: "_d3", label: "Possui alergia ou intolerância alimentar?", kind: "textarea", options: [], position: 3 },
  { id: "_d4", label: "Quantas refeições faz por dia?", kind: "text", options: [], position: 4 },
  { id: "_d5", label: "Pratica atividade física? Qual e com que frequência?", kind: "textarea", options: [], position: 5 },
  { id: "_d6", label: "Qualidade do sono", kind: "select", options: ["Ótima", "Boa", "Regular", "Ruim"], position: 6 },
  { id: "_d7", label: "Consumo de água diário (litros)", kind: "text", options: [], position: 7 },
  { id: "_d8", label: "Objetivo principal", kind: "textarea", options: [], position: 8 },
];

export function AnamneseTab({ coachId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coachId) return;
    (async () => {
      const { data: cli } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("id,name,whatsapp,email" as never)
        .eq("coach_id" as never, coachId as never)
        .order("name" as never);
      setClients((cli as unknown as Client[]) || []);

      const { data: qs } = await supabase
        .from("professional_anamnesis_questions" as never)
        .select("id,label,kind,options,position" as never)
        .eq("coach_id" as never, coachId as never)
        .eq("is_active" as never, true as never)
        .order("position" as never);
      const list = (qs as unknown as Question[]) || [];
      setQuestions(list.length ? list : DEFAULT_QUESTIONS);
    })();
  }, [coachId]);

  const filtered = useMemo(() => clients.filter((c) =>
    !q || `${c.name} ${c.whatsapp || ""} ${c.email || ""}`.toLowerCase().includes(q.toLowerCase())
  ), [clients, q]);

  const loadAnamnese = async (c: Client) => {
    setSelected(c);
    setLoading(true);
    const { data } = await supabase
      .from("professional_anamnesis_external" as never)
      .select("answers" as never)
      .eq("coach_id" as never, coachId as never)
      .eq("evaluation_client_id" as never, c.id as never)
      .maybeSingle();
    setAnswers(((data as { answers?: Record<string, string> } | null)?.answers) || {});
    setLoading(false);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("professional_anamnesis_external" as never)
      .upsert({ coach_id: coachId, evaluation_client_id: selected.id, answers } as never, { onConflict: "coach_id,evaluation_client_id" } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Anamnese salva");
  };

  if (!selected) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Anamnese</h1>
          <p className="text-sm text-white/50">Selecione um aluno para iniciar ou editar a anamnese</p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-white/50 py-6 text-center">Nenhum aluno encontrado. Cadastre na aba "Meus Alunos".</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => loadAnamnese(c)} className="flex w-full items-center justify-between rounded-xl bg-white/5 p-3 text-left hover:bg-white/10">
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-white/40">{c.whatsapp || c.email || "—"}</p>
                  </div>
                  <ClipboardList className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
          {questions.length === DEFAULT_QUESTIONS.length && questions[0].id.startsWith("_d") && (
            <p className="mt-4 text-[11px] text-white/40">
              💡 Você está usando perguntas padrão. Personalize na aba <strong>Configurações</strong>.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div>
          <button onClick={() => setSelected(null)} className="mb-1 text-xs text-white/40 hover:text-white">← Trocar aluno</button>
          <p className="text-base font-bold text-white">{selected.name}</p>
          <p className="text-xs text-white/40">{selected.whatsapp || selected.email || "—"}</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar anamnese
        </button>
      </div>

      <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          questions.map((q) => (
            <div key={q.id}>
              <label className="block text-xs font-semibold text-white/70 mb-1">{q.label}</label>
              {q.kind === "textarea" ? (
                <textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none"
                />
              ) : q.kind === "select" ? (
                <select
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-zinc-900">Selecione...</option>
                  {(q.options || []).map((o) => <option key={o} value={o} className="bg-zinc-900">{o}</option>)}
                </select>
              ) : (
                <input
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none"
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default AnamneseTab;
