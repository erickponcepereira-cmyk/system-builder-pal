import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, Plus, Power, ArrowLeft, KanbanSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CrmBoard, COLUNAS_PADRAO } from "@/components/crm/CrmBoard";

export const Route = createFileRoute("/_authenticated/admin/crm")({
  component: AdminCrm,
});

// crm_* ainda não está no types.ts gerado — ver docs/REGISTRO-MIGRATIONS.md
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

interface Parceiro {
  id: string;
  fantasy_name: string;
  city: string | null;
  state: string | null;
  status: string;
  business_area: string | null;
}

interface Quadro {
  id: string;
  nome: string;
  owner_id: string | null;
  escopo: string;
  arquivado_em: string | null;
}

function AdminCrm() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ativando, setAtivando] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [pRes, qRes] = await Promise.all([
      supabase.from("partners").select("id, fantasy_name, city, state, status, business_area").order("fantasy_name"),
      db.from("crm_quadros").select("id, nome, owner_id, escopo, arquivado_em").eq("escopo", "parceiro"),
    ]);
    if (pRes.error) toast.error("Não foi possível carregar os parceiros");
    if (qRes.error) toast.error("Não foi possível carregar os quadros — a migration já foi aplicada?");
    setParceiros((pRes.data || []) as Parceiro[]);
    setQuadros((qRes.data || []) as Quadro[]);
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const quadroDe = useCallback(
    (parceiroId: string) => quadros.find((q) => q.owner_id === parceiroId) || null,
    [quadros],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return parceiros;
    return parceiros.filter((p) =>
      [p.fantasy_name, p.city, p.state, p.business_area].filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [parceiros, busca]);

  const ativos = quadros.filter((q) => !q.arquivado_em).length;

  async function ativar(p: Parceiro) {
    setAtivando(p.id);
    const { data, error } = await db
      .from("crm_quadros")
      .insert({ escopo: "parceiro", owner_id: p.id, nome: `CRM — ${p.fantasy_name}` })
      .select()
      .single();
    if (error) {
      setAtivando(null);
      toast.error("Não deu para ativar o CRM");
      return;
    }
    const quadro = data as Quadro;
    const { error: erroColunas } = await db.from("crm_colunas").insert(
      COLUNAS_PADRAO.map((c, i) => ({ quadro_id: quadro.id, nome: c.nome, tipo: c.tipo, posicao: (i + 1) * 1000 })),
    );
    setAtivando(null);
    if (erroColunas) {
      toast.error("Quadro criado, mas as etapas falharam. Abra o quadro para criar o funil.");
    } else {
      toast.success(`CRM ativado para ${p.fantasy_name}`);
    }
    setQuadros((q) => [...q, quadro]);
  }

  async function alternar(quadro: Quadro) {
    const desativando = !quadro.arquivado_em;
    const arquivado_em = desativando ? new Date().toISOString() : null;
    const { error } = await db.from("crm_quadros").update({ arquivado_em }).eq("id", quadro.id);
    if (error) { toast.error("Não deu para mudar o estado"); return; }
    setQuadros((qs) => qs.map((q) => (q.id === quadro.id ? { ...q, arquivado_em } : q)));
    toast.success(desativando ? "CRM desativado" : "CRM reativado");
  }

  // ---- quadro aberto ----
  if (abertoId) {
    const quadro = quadros.find((q) => q.id === abertoId);
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
            <h1 className="truncate text-2xl font-bold text-white">{quadro?.nome || "Quadro"}</h1>
            <p className="text-sm text-white/50">Arraste os cartões entre as etapas</p>
          </div>
        </div>
        <CrmBoard quadroId={abertoId} />
      </>
    );
  }

  // ---- lista de academias ----
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">CRM</h1>
        <p className="text-sm text-white/50">Escolha quem recebe o painel de CRM e acompanhe os funis</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-xs text-white/50">Parceiros com CRM ativo</p>
            <KanbanSquare className="h-5 w-5 text-primary" />
          </div>
          <p className="text-2xl font-bold text-white">{carregando ? "—" : ativos}</p>
        </div>
        <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-start justify-between">
            <p className="text-xs text-white/50">Parceiros cadastrados</p>
            <Power className="h-5 w-5 text-white/40" />
          </div>
          <p className="text-2xl font-bold text-white">{carregando ? "—" : parceiros.length}</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cidade ou ramo"
          className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5" style={{ backgroundColor: "#1A1A1A" }}>
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !filtrados.length ? (
          <p className="py-12 text-center text-sm text-white/40">Nenhum parceiro encontrado.</p>
        ) : (
          filtrados.map((p) => {
            const quadro = quadroDe(p.id);
            const ativo = quadro && !quadro.arquivado_em;
            return (
              <div key={p.id} className="flex items-center gap-4 border-b border-white/5 p-4 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.fantasy_name}</p>
                  <p className="truncate text-xs text-white/40">
                    {[p.city, p.state].filter(Boolean).join(" · ") || "sem endereço"}
                    {p.business_area ? ` · ${p.business_area}` : ""}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                    ativo ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-white/40"
                  }`}
                >
                  {ativo ? "ativo" : quadro ? "desativado" : "sem CRM"}
                </span>

                {quadro ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setAbertoId(quadro.id)}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5"
                    >
                      Abrir quadro
                    </button>
                    <button
                      onClick={() => void alternar(quadro)}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white"
                    >
                      {ativo ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void ativar(p)}
                    disabled={ativando === p.id}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {ativando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Ativar CRM
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 text-xs text-white/30">
        Ativar cria o quadro já com o funil padrão. O dono do parceiro entra direto;
        para liberar um funcionário, inclua a permissão <code className="text-white/50">crm</code> no cadastro da equipe dele.
      </p>
    </>
  );
}
