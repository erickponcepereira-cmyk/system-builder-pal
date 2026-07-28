import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Copy, Check, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { listAllReferralLinks, type ReferralLinkRow } from "@/lib/admin-referral-links.functions";
import { getShareOrigin } from "@/lib/auth-redirects";

export const Route = createFileRoute("/_authenticated/admin/referral-links")({
  head: () => ({
    meta: [
      { title: "Links de Indicação — Admin FitMind Club" },
      { name: "description", content: "Todos os links de indicação de coaches, parceiros e alunos." },
    ],
  }),
  component: AdminReferralLinks,
});

const KIND_LABEL: Record<ReferralLinkRow["kind"], string> = {
  coach: "Coach",
  partner: "Parceiro",
  student: "Aluno",
};

const KIND_STYLE: Record<ReferralLinkRow["kind"], string> = {
  coach: "bg-primary/20 text-primary",
  partner: "bg-sky-500/20 text-sky-300",
  student: "bg-emerald-500/20 text-emerald-300",
};

function AdminReferralLinks() {
  const listFn = useServerFn(listAllReferralLinks);
  const [rows, setRows] = useState<ReferralLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | ReferralLinkRow["kind"]>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? getShareOrigin() : "");
    (async () => {
      try {
        const res = await listFn({ data: undefined as never });
        setRows(res.rows);
      } catch (e) {
        toast.error((e as Error)?.message || "Falha ao carregar links");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, kind]);

  const fullLink = (r: ReferralLinkRow) => `${origin}${r.path}`;

  const copy = async (r: ReferralLinkRow) => {
    try {
      await navigator.clipboard.writeText(fullLink(r));
      setCopied(r.code);
      toast.success("Link copiado");
      setTimeout(() => setCopied((c) => (c === r.code ? null : c)), 1800);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const storeLink = (r: ReferralLinkRow) => `${origin}${r.path}?to=loja`;

  const copyStore = async (r: ReferralLinkRow) => {
    try {
      await navigator.clipboard.writeText(storeLink(r));
      setCopied(`${r.code}:loja`);
      toast.success("Link da loja copiado");
      setTimeout(() => setCopied((c) => (c === `${r.code}:loja` ? null : c)), 1800);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const exportCsv = () => {
    const header = "Nome;Papel;Codigo;Link cadastro;Link loja;Email;Telefone";
    const body = filtered
      .map((r) =>
        [r.name, KIND_LABEL[r.kind], r.code, fullLink(r), storeLink(r), r.email || "", r.phone || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "links-indicacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Links de Indicação</h1>
        <p className="text-sm text-white/50">
          Todos os códigos de indicação da plataforma — use para montar e corrigir redes.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "#1A1A1A" }}>
          {(["all", "coach", "partner", "student"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${
                kind === k ? "bg-primary text-primary-foreground" : "text-white/60"
              }`}
            >
              {k === "all" ? "Todos" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={!filtered.length}
          className="rounded-xl bg-white/5 px-4 py-2.5 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando links...
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-white/50">Nenhum link encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-[11px] uppercase text-white/50">
                <tr>
                  <th className="p-3">Pessoa</th>
                  <th className="p-3 hidden sm:table-cell">Papel</th>
                  <th className="p-3">Código</th>
                  <th className="p-3 hidden lg:table-cell">Link</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.kind}-${r.entityId}`} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium text-white">{r.name}</div>
                      <div className="text-[11px] text-white/50">{r.email || "—"}</div>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[r.kind]}`}>
                        {KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-white/80">{r.code}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
                        <Link2 className="h-3 w-3" />
                        {fullLink(r)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex flex-col items-end gap-1.5 sm:flex-row">
                        <button
                          onClick={() => copy(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25"
                        >
                          {copied === r.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === r.code ? "Copiado" : "Cadastro"}
                        </button>
                        <button
                          onClick={() => copyStore(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-white/20"
                        >
                          {copied === `${r.code}:loja` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === `${r.code}:loja` ? "Copiado" : "Loja"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-white/40">{filtered.length} link(s) listado(s).</p>
    </>
  );
}
