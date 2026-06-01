import { useEffect, useState } from "react";
import { Plus, Users, Search, Cake, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import NewStudentModal from "./NewStudentModal";
import ClientDetailsModal from "./ClientDetailsModal";
import { WhatsAppButton } from "@/components/WhatsAppButton";


interface Props {
  coachId: string;
}

type Row = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  current_weight: number | null;
  height: number | null;
  gender: string;
  ethnicity: string;
  birth_date: string | null;
  created_at: string;
};

const SKIN_LABEL: Record<string, string> = {
  white: "Branca", black: "Preta", hispanic: "Parda", asian: "Amarela", indigenous: "Indígena", other: "Outra",
};
const GENDER_LABEL: Record<string, string> = { female: "F", male: "M", other: "—" };

function calcAge(birthDate: string | null) {
  if (!birthDate) return null;
  const y = new Date(birthDate).getFullYear();
  return new Date().getFullYear() - y;
}

export function ProfessionalStudentsTab({ coachId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastAssess, setLastAssess] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    // Paginate to bypass Supabase's default 1000-row limit
    const PAGE = 1000;
    let from = 0;
    const all: Row[] = [];
    while (true) {
      const { data } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("id,name,whatsapp,email,current_weight,height,gender,ethnicity,birth_date,created_at" as never)
        .eq("coach_id" as never, coachId as never)
        .order("created_at" as never, { ascending: false })
        .range(from, from + PAGE - 1);
      const rows = (data as unknown as Row[]) || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    setRows(all);
    setLoading(false);

    // Fetch last assessment per client
    const ids = all.map((r) => r.id);
    if (ids.length) {
      const { data: aData } = await supabase
        .from("coach_body_assessments" as never)
        .select("client_id,assessment_date" as never)
        .in("client_id" as never, ids as never)
        .order("assessment_date" as never, { ascending: false });
      const map: Record<string, string> = {};
      ((aData || []) as Array<{ client_id: string; assessment_date: string }>).forEach((a) => {
        if (!map[a.client_id]) map[a.client_id] = a.assessment_date;
      });
      setLastAssess(map);
    }
  };

  useEffect(() => { if (coachId) load(); }, [coachId]);

  const filtered = rows.filter((r) =>
    !q || `${r.name} ${r.whatsapp || ""} ${r.email || ""}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Alunos</h1>
          <p className="text-sm text-white/50">Cadastre e acompanhe os alunos que você atende</p>
        </div>
        <button onClick={() => setOpenNew(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo aluno
        </button>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        </div>

        {loading ? (
          <p className="text-sm text-white/50 py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-white/30 mb-2" />
            <p className="text-sm text-white/50">Nenhum aluno cadastrado.</p>
            <p className="text-xs text-white/30 mt-1">Use o botão "Novo aluno" para começar.</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((s) => {
              const age = calcAge(s.birth_date);
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenId(s.id)}
                  className="rounded-xl border border-white/5 p-4 text-left transition hover:border-primary/40 hover:bg-white/[0.02]"
                  style={{ backgroundColor: "#0F0F0F" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white">{s.name}</h3>
                      <p className="truncate text-xs text-white/45">{s.whatsapp || s.email || "—"}</p>
                      {s.birth_date && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/55">
                          <Cake className="h-3 w-3" /> {new Date(s.birth_date).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {GENDER_LABEL[s.gender] || "—"}{age ? ` · ${age}a` : ""}
                      </span>
                      <WhatsAppButton phone={s.whatsapp} size="sm" message={`Olá ${s.name.split(" ")[0]}!`} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <Stat label="Peso" value={s.current_weight ? `${s.current_weight}kg` : "—"} />
                    <Stat label="Altura" value={s.height ? `${s.height}cm` : "—"} />
                    <Stat label="Pele" value={SKIN_LABEL[s.ethnicity] || "—"} />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-white/55">
                    <Activity className="h-3 w-3" /> Última avaliação: <span className="font-bold text-white">{lastAssess[s.id] ? new Date(lastAssess[s.id]).toLocaleDateString("pt-BR") : "—"}</span>
                  </div>
                </button>

              );
            })}
          </div>
        )}
      </div>

      {openNew && (
        <NewStudentModal coachId={coachId} onClose={() => setOpenNew(false)} onCreated={load} />
      )}
      {openId && <ClientDetailsModal clientId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <p className="text-white/35">{label}</p>
      <p className="font-bold text-white">{value}</p>
    </div>
  );
}

export default ProfessionalStudentsTab;
