import { useEffect, useState } from "react";
import { Award, ChevronDown, ChevronRight, Dot } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyNetworkStructure, type CoachTreeNode, type MyNetworkStructure, type NetworkRankMedal, type NetworkRankPatent, type StudentBreakdown } from "@/lib/network-ranking.functions";
import { type CoachContext } from "@/routes/coach";
import CoachProfileModal from "@/components/coach/CoachProfileModal";

function StudentsBreakdown({ b, downlineCoaches, downlineLabel = "coaches abaixo" }: { b: StudentBreakdown; downlineCoaches: number; downlineLabel?: string }) {
  const parts: Array<{ label: string; value: number; cls: string }> = [
    { label: "Aluno", value: b.studentOnly, cls: "bg-white/10 text-white/70" },
    { label: "Aluno Coach", value: b.coachStudent, cls: "bg-primary/20 text-primary" },
    { label: "Aluno Profissional", value: b.professionalStudent, cls: "bg-emerald-500/15 text-emerald-400" },
    { label: "Aluno Parceiro", value: b.partnerStudent, cls: "bg-amber-500/15 text-amber-400" },
  ];
  return (
    <div className="mt-1 space-y-1">
      <p className="text-[11px] text-white/55">{b.total} alunos · {downlineCoaches} {downlineLabel}</p>
      <div className="flex flex-wrap gap-1">
        {parts.map((p) => (
          <span key={p.label} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.cls}`}>
            {p.value} {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PatentTag({ patent }: { patent: NetworkRankPatent }) {
  if (!patent) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
      style={{
        color: patent.color || "#fff",
        backgroundColor: patent.color ? `${patent.color}20` : "rgba(255,255,255,0.08)",
        borderColor: patent.color ? `${patent.color}55` : "rgba(255,255,255,0.15)",
      }}
    >
      {patent.name}
    </span>
  );
}

function MedalTag({ medal }: { medal: NetworkRankMedal }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Award className="h-3 w-3" /> {medal?.name || "Sem medalha"}
    </span>
  );
}

function Categories({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((c) => (
        <span key={c} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">{c}</span>
      ))}
    </div>
  );
}

function Classifications({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((t) => (
        <span
          key={t}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t === "Aluno" ? "bg-white/10 text-white/70" : t === "Aluno Coach" ? "bg-primary/20 text-primary" : t === "Profissional" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function TreeNode({ node, expanded, toggle, onOpen, clickable }: { node: CoachTreeNode; expanded: Record<string, boolean>; toggle: (id: string) => void; onOpen: (n: CoachTreeNode) => void; clickable: boolean }) {
  const isOpen = expanded[node.coachId] ?? node.level <= 2;
  const hasChildren = node.children.length > 0;
  return (
    <div className="relative">
      <div className="flex items-start gap-2 py-1.5">
        <button
          type="button"
          onClick={() => hasChildren && toggle(node.coachId)}
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${hasChildren ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-white/10 text-white/40"}`}
        >
          {hasChildren ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <Dot className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => clickable && onOpen(node)}
          className={`flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left ${clickable ? "hover:border-primary/40 hover:bg-white/10" : ""}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{node.name}</p>
              <Classifications items={node.classifications} />
              <Categories items={node.categories} />
              <div className="mt-1 text-[11px] text-white/45">L{node.level}</div>
              <StudentsBreakdown b={node.directStudents} downlineCoaches={node.childCoaches} />

            </div>
            <div className="flex flex-col items-end gap-1">
              <PatentTag patent={node.patent} />
              <MedalTag medal={node.medal} />
            </div>
          </div>
        </button>
      </div>
      {isOpen && hasChildren && (
        <div className="ml-6 space-y-1 border-l border-white/10 pl-3">
          {node.children.map((child) => <TreeNode key={child.coachId} node={child} expanded={expanded} toggle={toggle} onOpen={onOpen} clickable={false} />)}
        </div>
      )}
    </div>
  );
}

export function NetworkTreeTab({ coach: _coach }: { coach: CoachContext | null }) {
  const fetchNetwork = useServerFn(getMyNetworkStructure);
  const [data, setData] = useState<MyNetworkStructure | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [openCoachId, setOpenCoachId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchNetwork().then((r) => { if (active) setData(r); }).catch(() => { if (active) setData(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchNetwork]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) }));
  const openModal = (n: CoachTreeNode) => setOpenCoachId(n.coachId);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Árvore da Rede</h1>
        <p className="text-sm text-white/50">Clique em um coach da primeira linha para ver os detalhes e a sub-rede dele.</p>
      </div>
      <div className="space-y-5 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando rede...</p> : !data?.me ? <p className="text-sm text-white/50">Nenhum painel de coach encontrado.</p> : (
          <>
            {data.upline && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-white/35">Acima de você</p>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{data.upline.name}</p>
                    <Classifications items={data.upline.classifications} />
                    <Categories items={data.upline.categories} />
                    <StudentsBreakdown b={data.upline.directStudents} downlineCoaches={data.upline.childCoaches} downlineLabel="coaches diretos" />
                  </div>
                    <div className="flex flex-col items-end gap-1">
                      <PatentTag patent={data.upline.patent} />
                      <MedalTag medal={data.upline.medal} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="border-l-2 border-primary/40 pl-5">
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{data.me.name} (você)</p>
                    <Classifications items={data.me.classifications} />
                    <Categories items={data.me.categories} />
                    <p className="mt-1 text-[11px] text-white/55">{data.me.directStudents.total} alunos · {data.totals.downlineCoaches} coaches na rede abaixo</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <PatentTag patent={data.me.patent} />
                    <MedalTag medal={data.me.medal} />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-white/35">Abaixo de você</p>
              {data.children.length === 0 ? <p className="text-sm text-white/50">Nenhum coach abaixo ainda.</p> : data.children.map((node) => <TreeNode key={node.coachId} node={node} expanded={expanded} toggle={toggle} onOpen={openModal} clickable />)}
            </div>
          </>
        )}
      </div>
      {openCoachId && <CoachProfileModal coachId={openCoachId} onClose={() => setOpenCoachId(null)} />}
    </>
  );
}

export default NetworkTreeTab;
