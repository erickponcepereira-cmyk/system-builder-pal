import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import {
  searchProfilesForMerge,
  adminMergeProfiles,
  type MergeCandidate,
} from "@/lib/admin-merge.functions";

function badges(c: MergeCandidate) {
  const list: string[] = [];
  if (c.hasCoach) list.push("coach");
  if (c.hasStudent) list.push("aluno");
  if (c.hasPartner) list.push("parceiro");
  return list;
}

/**
 * Ferramenta administrativa para unificar dois cadastros da mesma pessoa
 * (ex.: conta criada por e-mail + conta criada pelo Google).
 * O cadastro de origem é desativado e todo o histórico vai para o destino.
 */
export function MergeAccountsPanel() {
  const searchFn = useServerFn(searchProfilesForMerge);
  const mergeFn = useServerFn(adminMergeProfiles);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<MergeCandidate | null>(null);
  const [target, setTarget] = useState<MergeCandidate | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doSearch = async () => {
    if (term.trim().length < 2) return toast.error("Digite ao menos 2 caracteres.");
    setLoading(true);
    try {
      const rows = await searchFn({ data: { term: term.trim() } });
      setResults(rows);
      if (!rows.length) toast.info("Nenhum cadastro encontrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na busca.");
    } finally {
      setLoading(false);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!source || !target) return toast.error("Selecione o cadastro de origem e o de destino.");
    if (source.id === target.id) return toast.error("Origem e destino precisam ser diferentes.");
    if (!dryRun && !window.confirm(`Confirmar mesclagem definitiva de "${source.name}" para "${target.name}"?`)) return;
    setBusy(true);
    try {
      const res = await mergeFn({ data: { sourceProfileId: source.id, targetProfileId: target.id, dryRun } });
      setPreview(res.result);
      toast.success(dryRun ? "Simulação concluída — confira o resumo." : "Cadastros mesclados com sucesso!");
      if (!dryRun) {
        setSource(null);
        setTarget(null);
        setResults([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao mesclar cadastros.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200/80">
        <p className="flex items-center gap-2 font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" /> Use com cuidado
        </p>
        <p className="mt-1">
          Todo o histórico (pedidos, carteira, indicações, desafios) do cadastro de <b>origem</b> é
          transferido para o de <b>destino</b>. A origem fica marcada como mesclada e perde o acesso.
          Rode a simulação antes de confirmar.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Buscar por nome, e-mail, CPF ou telefone..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
          />
        </div>
        <button
          onClick={doSearch}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
        </button>
      </div>

      <div className="rounded-xl border border-white/5 bg-[#111] divide-y divide-white/5">
        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">Nenhum resultado.</p>
        ) : (
          results.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {c.name || "Sem nome"}{" "}
                  {c.mergedIntoProfileId && (
                    <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">mesclado</span>
                  )}
                </p>
                <p className="truncate text-xs text-white/50">
                  {c.email || "sem e-mail"} · {c.role || "—"} · {c.status || "—"}
                  {badges(c).length ? ` · ${badges(c).join(", ")}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSource(c)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${source?.id === c.id ? "border-red-400 text-red-300" : "border-white/10 text-white/70 hover:text-white"}`}
                >
                  Origem
                </button>
                <button
                  onClick={() => setTarget(c)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${target?.id === c.id ? "border-emerald-400 text-emerald-300" : "border-white/10 text-white/70 hover:text-white"}`}
                >
                  Destino
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-white/5 bg-[#111] p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-red-200">
            {source ? `${source.name} (${source.email})` : "Selecione a origem"}
          </span>
          <ArrowRight className="h-4 w-4 text-white/40" />
          <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
            {target ? `${target.name} (${target.email})` : "Selecione o destino"}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => run(true)}
            disabled={busy || !source || !target}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 hover:text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simular"}
          </button>
          <button
            onClick={() => run(false)}
            disabled={busy || !source || !target}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Mesclar definitivamente
          </button>
        </div>

        {preview && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-white/70">
            {preview}
          </pre>
        )}
      </div>
    </div>
  );
}
