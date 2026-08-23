import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, IdCard, ShieldAlert, RotateCcw, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminSearchCardPeople, type CardPersonResult } from "@/lib/admin-membership-card.functions";

export const Route = createFileRoute("/_authenticated/admin/carteirinha")({
  head: () => ({
    meta: [
      { title: "Carteirinha — Admin FitMind Club" },
      { name: "description", content: "Gerencie exceções manuais de validade da carteirinha de aluno e de membro, com histórico completo." },
      { property: "og:title", content: "Carteirinha — Admin FitMind Club" },
      { property: "og:description", content: "Exceções manuais de validade da carteirinha com histórico de quem alterou e por quê." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCarteirinha,
});

type Escopo = "aluno" | "membro";

type LadoSituacao = {
  calculado: string | null;
  excecao: string | null;
  vigente: string | null;
  origem: string;
  valido_hoje: boolean;
  motivo: string | null;
};

type HistItem = {
  id: string;
  escopo: Escopo;
  valido_ate: string | null;
  valor_anterior: string | null;
  motivo: string | null;
  ativo: boolean;
  criado_em: string | null;
  criado_por: string | null;
  revogado_em: string | null;
  revogado_por: string | null;
};

type Situacao = {
  aluno: LadoSituacao;
  membro: LadoSituacao;
  historico: HistItem[];
};

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function AdminCarteirinha() {
  const searchFn = useServerFn(adminSearchCardPeople);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CardPersonResult[]>([]);
  const [person, setPerson] = useState<CardPersonResult | null>(null);
  const [sit, setSit] = useState<Situacao | null>(null);
  const [loading, setLoading] = useState(false);
  const [formEscopo, setFormEscopo] = useState<Escopo | null>(null);
  const [validoAte, setValidoAte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const doSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchFn({ data: { q: q.trim() } });
      setResults(r);
      if (r.length === 0) toast.info("Ninguém encontrado com esse nome ou e-mail.");
    } catch (err: any) {
      toast.error(err?.message || "Erro na busca");
    } finally {
      setSearching(false);
    }
  };

  const loadSituacao = async (profileId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("carteirinha_situacao" as never, {
        _profile_id: profileId,
      } as never);
      if (error) throw new Error(error.message);
      setSit(data as unknown as Situacao);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar a situação");
    } finally {
      setLoading(false);
    }
  };

  const selectPerson = async (p: CardPersonResult) => {
    setPerson(p);
    setResults([]);
    setSit(null);
    setFormEscopo(null);
    await loadSituacao(p.profileId);
  };

  const openForm = (escopo: Escopo) => {
    setFormEscopo(escopo);
    setValidoAte("");
    setMotivo("");
  };

  const salvarExcecao = async () => {
    if (!person || !formEscopo) return;
    if (!validoAte) return toast.error("Informe até quando a carteirinha vale");
    if (!motivo.trim()) return toast.error("Informe o motivo da exceção");
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("carteirinha_definir_excecao" as never, {
        _profile_id: person.profileId,
        _escopo: formEscopo,
        _valido_ate: new Date(`${validoAte}T23:59:59`).toISOString(),
        _motivo: motivo.trim(),
        _admin_user_id: auth.user?.id,
      } as never);
      if (error) throw new Error(error.message);
      toast.success("Exceção registrada");
      setFormEscopo(null);
      await loadSituacao(person.profileId);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar a exceção");
    } finally {
      setSaving(false);
    }
  };

  const revogar = async (escopo: Escopo) => {
    if (!person || !sit) return;
    const ativa = sit.historico.find((h) => h.ativo && h.escopo === escopo);
    if (!ativa) return toast.error("Nenhuma exceção ativa encontrada");
    if (!window.confirm("Voltar para a data calculada automaticamente? A exceção manual será desativada.")) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("carteirinha_revogar_excecao" as never, {
        _override_id: ativa.id,
        _admin_user_id: auth.user?.id,
      } as never);
      if (error) throw new Error(error.message);
      toast.success("Exceção revogada — voltou para a data calculada");
      await loadSituacao(person.profileId);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao revogar");
    } finally {
      setSaving(false);
    }
  };

  const Card = ({ titulo, escopo, lado }: { titulo: string; escopo: Escopo; lado: LadoSituacao }) => (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <IdCard className="h-4 w-4" /> {titulo}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-foreground">{fmt(lado.vigente)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            lado.valido_hoje
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-destructive/20 text-destructive"
          }`}
        >
          {lado.valido_hoje ? "válida" : "vencida"}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {escopo === "aluno" ? "calculado pelas compras" : "calculado pela mensalidade"}: {fmt(lado.calculado)}
      </p>

      {lado.excecao ? (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2 text-sm text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Exceção manual até {fmt(lado.excecao)}
              {lado.motivo ? ` — ${lado.motivo}` : ""}
            </span>
          </div>
          <button
            onClick={() => revogar(escopo)}
            disabled={saving}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Voltar ao calculado
          </button>
        </div>
      ) : (
        <button
          onClick={() => openForm(escopo)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <CalendarDays className="h-3.5 w-3.5" /> Definir exceção
        </button>
      )}

      {formEscopo === escopo && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Até quando</label>
            <input
              type="date"
              value={validoAte}
              onChange={(e) => setValidoAte(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo (obrigatório)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="explique por que, isso fica no histórico"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={salvarExcecao}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar exceção
            </button>
            <button
              onClick={() => setFormEscopo(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Carteirinha</h1>
        <p className="text-sm text-muted-foreground">
          Consulte a validade da carteirinha, registre exceções manuais com motivo e volte ao cálculo automático quando quiser.
        </p>
      </div>

      <form onSubmit={doSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground"
          />
        </div>
        <button
          type="submit"
          disabled={searching || q.trim().length < 2}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {results.map((r) => (
            <button
              key={r.profileId}
              onClick={() => selectPerson(r)}
              className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{r.name || "Sem nome"}</span>
              <span className="text-xs text-muted-foreground">{r.email || "—"}</span>
            </button>
          ))}
        </div>
      )}

      {person && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{person.name || "Sem nome"}</span>
          <span className="ml-2 text-xs text-muted-foreground">{person.email || "—"}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando situação...
        </div>
      )}

      {sit && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card titulo="Carteirinha de aluno" escopo="aluno" lado={sit.aluno} />
            <Card titulo="Carteirinha de membro (coach/parceiro/profissional)" escopo="membro" lado={sit.membro} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
              Histórico de alterações
            </div>
            {sit.historico.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma exceção registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Quando</th>
                      <th className="px-4 py-2 text-left">Escopo</th>
                      <th className="px-4 py-2 text-left">De → Para</th>
                      <th className="px-4 py-2 text-left">Motivo</th>
                      <th className="px-4 py-2 text-left">Quem fez</th>
                      <th className="px-4 py-2 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sit.historico.map((h) => (
                      <tr key={h.id} className={h.ativo ? "" : "opacity-50"}>
                        <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(h.criado_em)}</td>
                        <td className="px-4 py-2 text-foreground">{h.escopo === "aluno" ? "Aluno" : "Membro"}</td>
                        <td className="px-4 py-2 text-foreground">
                          {fmt(h.valor_anterior)} → {fmt(h.valido_ate)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{h.motivo || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{h.criado_por || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {h.ativo
                            ? "ativa"
                            : `revogada em ${fmt(h.revogado_em)}${h.revogado_por ? ` por ${h.revogado_por}` : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
