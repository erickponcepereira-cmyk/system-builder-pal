import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Plus, Power, ArrowLeft, KanbanSquare, Building2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { listCrmTargets, ativarCrm, alternarCrm, type CrmTarget } from "@/lib/admin-crm.functions";

export const Route = createFileRoute("/_authenticated/admin/crm")({
  component: AdminCrm,
});

type Escopo = "parceiro" | "profissional";

function AdminCrm() {
  const carregarAlvos = useServerFn(listCrmTargets);
  const ativarFn = useServerFn(ativarCrm);
  const alternarFn = useServerFn(alternarCrm);

  const [escopo, setEscopo] = useState<Escopo>("parceiro");
  const [parceiros, setParceiros] = useState<CrmTarget[]>([]);
  const [profissionais, setProfissionais] = useState<CrmTarget[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [abertoNome, setAbertoNome] = useState<string>("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await carregarAlvos({});
      setParceiros(r.parceiros);
      setProfissionais(r.profissionais);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a lista");
    }
    setCarregando(false);
  }, [carregarAlvos]);

  useEffect(() => { void carregar(); }, [carregar]);

  const lista = escopo === "parceiro" ? parceiros : profissionais;

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((p) => [p.nome, p.subtitulo].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [lista, busca]);

  const ativos = [...parceiros, ...profissionais].filter((p) => p.quadroId && !p.arquivadoEm).length;

  function aplicar(alvo: CrmTarget, patch: Partial<CrmTarget>) {
    const setter = alvo.escopo === "parceiro" ? setParceiros : setProfissionais;
    setter((prev) => prev.map((p) => (p.id === alvo.id ? { ...p, ...patch } : p)));
  }

  async function ativar(alvo: CrmTarget) {
    setAgindo(alvo.id);
    try {
      const r = await ativarFn({ data: { escopo: alvo.escopo, ownerId: alvo.id, nome: alvo.nome } });
      aplicar(alvo, { quadroId: r.quadroId, arquivadoEm: null });
      toast.success(`CRM ativado para ${alvo.nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para ativar o CRM");
    }
    setAgindo(null);
  }

  async function alternar(alvo: CrmTarget) {
    if (!alvo.quadroId) return;
    const ativando = !!alvo.arquivadoEm;
    setAgindo(alvo.id);
    try {
      const r = await alternarFn({ data: { quadroId: alvo.quadroId, ativar: ativando } });
      aplicar(alvo, { arquivadoEm: r.arquivadoEm });
      toast.success(ativando ? "CRM reativado" : "CRM desativado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para mudar o estado");
    }
    setAgindo(null);
  }

  // ---- quadro aberto ----
  if (abertoId) {
    return (
      <>
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setAbertoId(null)}
            className="rounded-xl border border-white/10 p-2 text-white/60 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white">CRM — {abertoNome}</h1>
            <p className="text-sm text-white/50">Arraste os cartões entre as etapas</p>
          </div>
        </div>
        <CrmBoard quadroId={abertoId} />
      </>
    );
  }

  // ---- lista ----
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">CRM</h1>
        <p className="text-sm text-white/50">Libere o painel de CRM para parceiros e profissionais</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-xs text-white/50">CRMs ativos</p>
            <KanbanSquare className="h-5 w-5 text-primary" />
          </div>
          <p className="text-2xl font-bold text-white">{carregando ? "—" : ativos}</p>
        </div>
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-xs text-white/50">Parceiros cadastrados</p>
            <Building2 className="h-5 w-5 text-white/40" />
          </div>
          <p className="text-2xl font-bold text-white">{carregando ? "—" : parceiros.length}</p>
        </div>
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-xs text-white/50">Profissionais cadastrados</p>
            <Stethoscope className="h-5 w-5 text-white/40" />
          </div>
          <p className="text-2xl font-bold text-white">{carregando ? "—" : profissionais.length}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {([
          { key: "parceiro" as const, label: "Parceiros", icon: Building2 },
          { key: "profissional" as const, label: "Profissionais", icon: Stethoscope },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setEscopo(t.key)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              escopo === t.key ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cidade ou área"
          className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5" style={{ backgroundColor: "#1A1A1A" }}>
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !filtrados.length ? (
          <p className="py-12 text-center text-sm text-white/40">Nenhum registro encontrado.</p>
        ) : (
          filtrados.map((p) => {
            const ativo = !!p.quadroId && !p.arquivadoEm;
            return (
              <div key={`${p.escopo}-${p.id}`} className="flex items-center gap-4 border-b border-white/5 p-4 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.nome}</p>
                  <p className="truncate text-xs text-white/40">{p.subtitulo || "—"}</p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                    ativo ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-white/40"
                  }`}
                >
                  {ativo ? "ativo" : p.quadroId ? "desativado" : "sem CRM"}
                </span>

                {p.quadroId ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => { setAbertoId(p.quadroId); setAbertoNome(p.nome); }}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5"
                    >
                      Abrir quadro
                    </button>
                    <button
                      onClick={() => void alternar(p)}
                      disabled={agindo === p.id}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white disabled:opacity-50"
                    >
                      {ativo ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void ativar(p)}
                    disabled={agindo === p.id}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {agindo === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Ativar CRM
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-white/30">
        <Power className="h-3.5 w-3.5" />
        Ativar cria o quadro já com o funil padrão. O dono vê a aba CRM no painel dele;
        para liberar um funcionário do parceiro, inclua a permissão <code className="text-white/50">crm</code> nos membros da unidade.
      </p>
    </>
  );
}
