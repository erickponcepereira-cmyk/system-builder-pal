import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Dot, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyNetworkStructure, type CoachTreeNode, type MyNetworkStructure, type StudentBreakdown } from "@/lib/network-ranking.functions";
import { type CoachContext } from "@/routes/coach";

function Breakdown({ data }: { data: StudentBreakdown }) {
  return (
    <p className="text-[11px] text-white/45">
      {data.total} alunos: {data.studentOnly} aluno · {data.coachStudent} coach/aluno · {data.professionalStudent} profissional/aluno · {data.partnerStudent} parceiro/aluno
    </p>
  );
}

function TreeNode({ node, expanded, toggle }: { node: CoachTreeNode; expanded: Record<string, boolean>; toggle: (id: string) => void }) {
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
        <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{node.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Breakdown data={node.directStudents} />
                {node.childCoaches > 0 && <span className="text-[11px] text-primary">· {node.childCoaches} coaches abaixo</span>}
              </div>
            </div>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">L{node.level}</span>
          </div>
        </div>
      </div>
      {isOpen && hasChildren && (
        <div className="ml-6 space-y-1 border-l border-white/10 pl-3">
          {node.children.map((child) => <TreeNode key={child.coachId} node={child} expanded={expanded} toggle={toggle} />)}
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchNetwork().then((r) => { if (active) setData(r); }).catch(() => { if (active) setData(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchNetwork]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) }));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Árvore da Rede</h1>
        <p className="text-sm text-white/50">Rede real baseada apenas nos painéis de coach e com alunos separados por tipo.</p>
      </div>
      <div className="space-y-5 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando rede...</p> : !data?.me ? <p className="text-sm text-white/50">Nenhum painel de coach encontrado.</p> : (
          <>
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-white/35">Acima de você</p>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">{data.upline?.name || "Sem coach acima"}</p>
                {data.upline ? <Breakdown data={data.upline.directStudents} /> : <p className="text-xs text-white/45">Você está no topo desta ramificação.</p>}
              </div>
            </div>
            <div className="border-l-2 border-primary/40 pl-5">
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
                <p className="text-sm font-bold text-white">{data.me.name}</p>
                <Breakdown data={data.me.directStudents} />
                <p className="mt-1 text-[11px] text-primary">{data.totals.downlineCoaches} coaches na rede abaixo</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-white/35">Abaixo de você</p>
              {data.children.length === 0 ? <p className="text-sm text-white/50">Nenhum coach abaixo ainda.</p> : data.children.map((node) => <TreeNode key={node.coachId} node={node} expanded={expanded} toggle={toggle} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default NetworkTreeTab;