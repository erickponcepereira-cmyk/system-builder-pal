import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, ArrowRight, AlertTriangle } from "lucide-react";
import {
  searchProfilesForMerge,
  adminMergeProfiles,
  type MergeCandidate,
  type MergeResult,
} from "@/lib/admin-merge.functions";

function badges(c: MergeCandidate) {
  const list: string[] = [];
  if (c.hasCoach) list.push("coach");
  if (c.hasStudent) list.push("aluno");
  if (c.hasPartner) list.push("parceiro");
  return list;
}

function formatAccess(iso: string | null) {
  if (!iso) return "nunca acessou pelo app";
  return `último acesso ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

/** O que cada ligação movida significa para quem está unificando. */
const MOVED_LABELS: Record<string, string> = {
  "students.coach_id": "Alunos do coach",
  "coaches.upline_coach_id": "Coaches da equipe",
  "commissions.beneficiary_profile_id": "Comissões",
  "withdrawal_requests.profile_id": "Saques",
  "partners.profile_id": "Empresas parceiras",
  "partner_members.profile_id": "Dono da unidade",
  "partner_product_orders.student_id": "Compras de produtos",
  "store_orders.student_id": "Pedidos da loja",
  "transactions.student_id": "Pagamentos",
  "competition_enrollments.student_id": "Inscrições no desafio",
  "notifications.profile_id": "Notificações",
  logins_movidos: "Logins (Apple/Google)",
  mensalidade_da_origem: "Mensalidade da origem",
  faturas_canceladas: "Faturas canceladas",
  faturas_movidas: "Faturas movidas",
  coach_da_origem: "Coach da origem",
  aluno_da_origem: "Aluno da origem",
};

function MergeSummary({ result }: { result: MergeResult }) {
  const moved = Object.entries(result.moved ?? {});
  const highlighted = moved.filter(([key]) => MOVED_LABELS[key]);
  const others = moved.filter(([key]) => !MOVED_LABELS[key]);
  const skipped = Object.entries(result.skipped ?? {});

  return (
    <div className="mt-4 space-y-3 text-xs">
      {result.erro && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-red-200">
          A unificação falharia: {result.erro}
        </p>
      )}
      {(result.avisos ?? []).map((aviso) => (
        <p key={aviso} className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200">
          {aviso}
        </p>
      ))}
      <ul className="grid gap-1 sm:grid-cols-2">
        {highlighted.map(([key, value]) => (
          <li key={key} className="flex justify-between rounded bg-white/5 px-3 py-1.5 text-white/80">
            <span>{MOVED_LABELS[key]}</span>
            <span className="font-semibold text-white">{String(value)}</span>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <details className="text-white/50">
          <summary className="cursor-pointer">Outras ligações movidas ({others.length})</summary>
          <p className="mt-1">{others.map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
        </details>
      )}
      {skipped.length > 0 && (
        <p className="text-white/50">
          Ficam na origem por conflito (saldos são recalculados):{" "}
          {skipped.map(([key, value]) => `${key}: ${value}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * Ferramenta administrativa para unificar dois cadastros da mesma pessoa
 * (ex.: conta criada por e-mail + conta criada pelo Google ou pela Apple).
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
  const [preview, setPreview] = useState<MergeResult | null>(null);
  const [simulatedPair, setSimulatedPair] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pairKey = source && target ? `${source.id}>${target.id}` : null;
  const canMerge = !!pairKey && simulatedPair === pairKey && !preview?.erro;
  const targetIsOlder =
    !!source?.lastAccessAt &&
    (!target?.lastAccessAt || new Date(target.lastAccessAt) < new Date(source.lastAccessAt));

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
      if (dryRun) {
        setSimulatedPair(pairKey);
        if (res.result.erro) toast.error("A simulação encontrou um problema — veja o resumo.");
        else toast.success("Simulação concluída — confira o resumo.");
        return;
      }
      toast.success("Cadastros mesclados com sucesso!");
      setSource(null);
      setTarget(null);
      setResults([]);
      setSimulatedPair(null);
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
          Todo o histórico (pedidos, comissões, saques, alunos, equipe, empresa parceira, desafios) do
          cadastro de <b>origem</b> é transferido para o de <b>destino</b>. Login pela Apple ou Google da
          origem passa a abrir o destino; o login por e-mail da origem é bloqueado. A mensalidade da
          origem é cancelada se o destino já tiver a dele. Escolha como destino o cadastro que a pessoa
          usa — o de acesso mais recente. Simule antes de confirmar.
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
                <p className="text-[11px] text-white/40">{formatAccess(c.lastAccessAt)}</p>
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

        {source && target && targetIsOlder && (
          <p className="mt-3 text-xs text-amber-200">
            O destino escolhido foi acessado antes da origem. Confira se não está invertido: o destino
            deve ser o cadastro que a pessoa usa hoje.
          </p>
        )}

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
            disabled={busy || !canMerge}
            title={canMerge ? undefined : "Simule esta combinação antes, sem erro, para liberar"}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Mesclar definitivamente
          </button>
        </div>

        {preview && <MergeSummary result={preview} />}
      </div>
    </div>
  );
}
