import { Award, ChevronDown, ChevronRight, Dot, X } from "lucide-react";
import { useState } from "react";
import type { CoachTreeNode, NetworkRankMedal, NetworkRankPatent } from "@/lib/network-ranking.functions";

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

function SubTree({ node }: { node: CoachTreeNode }) {
  const [open, setOpen] = useState(node.level <= 2);
  const has = node.children.length > 0;
  return (
    <div>
      <div className="flex items-start gap-2 py-1.5">
        <button
          type="button"
          onClick={() => has && setOpen((v) => !v)}
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${has ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-white/10 text-white/40"}`}
        >
          {has ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <Dot className="h-3 w-3" />}
        </button>
        <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
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
        </div>
      </div>
      {open && has && (
        <div className="ml-6 space-y-1 border-l border-white/10 pl-3">
          {node.children.map((c) => <SubTree key={c.coachId} node={c} />)}
        </div>
      )}
    </div>
  );
}

export interface CoachNetworkModalData {
  coachId: string;
  name: string;
  email?: string;
  categories: string[];
  patent: NetworkRankPatent;
  medal: NetworkRankMedal;
  directStudents: number;
  childCoaches: number;
  children: CoachTreeNode[];
}

export default function CoachNetworkModal({ data, onClose }: { data: CoachNetworkModalData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#161616]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">{data.name}</h2>
            {data.email && <p className="truncate text-xs text-white/45">{data.email}</p>}
            <Categories items={data.categories} />
            <div className="mt-2 flex flex-wrap gap-2">
              <PatentTag patent={data.patent} />
              <MedalTag medal={data.medal} />
            </div>
            <p className="mt-2 text-[11px] text-white/45">{data.directStudents} alunos diretos · {data.childCoaches} coaches diretos</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          <p className="mb-2 text-xs font-bold uppercase text-white/35">Downlines</p>
          {data.children.length === 0 ? (
            <p className="text-sm text-white/50">Sem coaches abaixo.</p>
          ) : (
            <div className="space-y-1">{data.children.map((c) => <SubTree key={c.coachId} node={c} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
