import { useEffect, useState } from "react";
import { Award, ChevronDown, ChevronRight, Dot } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyNetworkStructure, type CoachTreeNode, type MyNetworkStructure, type NetworkRankMedal, type NetworkRankPatent } from "@/lib/network-ranking.functions";
import { type CoachContext } from "@/routes/coach";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";

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
              <Categories items={node.categories} />
              <p className="mt-1 text-[11px] text-white/45">L{node.level} · {node.directStudents.total} alunos · {node.childCoaches} coaches abaixo</p>
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
  const [modal, setModal] = useState<CoachNetworkModalData | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchNetwork().then((r) => { if (active) setData(r); }).catch(() => { if (active) setData(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchNetwork]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) }));
  const openModal = (n: CoachTreeNode) => setModal({
    coachId: n.coachId,
    name: n.name,
    email: n.email,
    categories: n.categories,
    patent: n.patent,
    medal: n.medal,
    directStudents: n.directStudents.total,
    childCoaches: n.childCoaches,
    children: n.children,
  });

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
                      <Categories items={data.upline.categories} />
                      <p className="mt-1 text-[11px] text-white/45">{data.upline.directStudents.total} alunos · {data.upline.childCoaches} coaches diretos</p>
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
      {modal && <CoachNetworkModal data={modal} onClose={() => setModal(null)} />}
    </>
  );
}

export default NetworkTreeTab;
