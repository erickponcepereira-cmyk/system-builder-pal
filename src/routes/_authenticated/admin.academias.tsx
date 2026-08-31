import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Loader2,
  Search,
  Trash2,
  Save,
  Camera,
  PlayCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarModelosAcademia,
  obterConteudoDoModelo,
  salvarModeloAcademia,
  excluirModeloAcademia,
  salvarAcademiaComoModelo,
  aplicarModeloAcademia,
  listarAcademiasConfiguradas,
  buscarParceiros,
  type ModeloResumo,
  type RelatoAplicacao,
  type AcademiaConfigurada,
  type ParceiroBusca,
} from "@/lib/admin-academia-modelo.functions";

export const Route = createFileRoute("/_authenticated/admin/academias")({
  head: () => ({
    meta: [
      { title: "Academias — Admin FitMind Club" },
      {
        name: "description",
        content:
          "Modelos de configuração de academia: salve uma academia que já funciona como modelo e aplique em um parceiro em um clique.",
      },
      { property: "og:title", content: "Academias — Admin FitMind Club" },
      {
        property: "og:description",
        content: "Defina o conjunto padrão de catraca, planos, avisos e turmas e aplique em um parceiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAcademias,
});

const CORES_DA_ACAO: Record<string, string> = {
  criado: "bg-emerald-500/20 text-emerald-400",
  atualizado: "bg-sky-500/20 text-sky-400",
  pulado: "bg-muted text-muted-foreground",
  ignorado: "bg-muted text-muted-foreground",
  protegido: "bg-amber-500/20 text-amber-300",
  removido: "bg-destructive/20 text-destructive",
};

const fmtDataHora = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Etiqueta({ acao }: { acao: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        CORES_DA_ACAO[acao] || "bg-muted text-muted-foreground"
      }`}
    >
      {acao}
    </span>
  );
}

function Relato({ relato }: { relato: RelatoAplicacao }) {
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">
          {relato.simulado ? "Prévia — nada foi gravado" : "Aplicado"}
        </span>
        <span className="text-muted-foreground">
          {relato.modelo} → {relato.parceiro} · {fmtDataHora(relato.quando)}
        </span>
        {relato.sobrescrever && <Etiqueta acao="protegido" />}
      </div>

      {Object.entries(relato.secoes || {}).map(([secao, dados]) => (
        <div key={secao} className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold capitalize text-foreground">{secao}</span>
            {Object.entries(dados.resumo || {}).map(([acao, n]) => (
              <span key={acao} className="text-xs text-muted-foreground">
                {n} {acao}
              </span>
            ))}
          </div>
          <div className="space-y-1">
            {(dados.itens || []).map((item, i) => (
              <div key={`${secao}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
                <Etiqueta acao={item.acao} />
                <span className="text-foreground">{item.item ?? "—"}</span>
                {item.motivo && <span className="text-muted-foreground">{item.motivo}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {relato.secoes_ignoradas?.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Seções que este aplicador ainda não conhece, mantidas no modelo:{" "}
          {relato.secoes_ignoradas.join(", ")}
        </p>
      )}
    </div>
  );
}

function AdminAcademias() {
  const listarModelos = useServerFn(listarModelosAcademia);
  const obterConteudo = useServerFn(obterConteudoDoModelo);
  const salvarModelo = useServerFn(salvarModeloAcademia);
  const excluirModelo = useServerFn(excluirModeloAcademia);
  const congelarAcademia = useServerFn(salvarAcademiaComoModelo);
  const aplicar = useServerFn(aplicarModeloAcademia);
  const listarAcademias = useServerFn(listarAcademiasConfiguradas);
  const procurarParceiros = useServerFn(buscarParceiros);

  const [modelos, setModelos] = useState<ModeloResumo[]>([]);
  const [academias, setAcademias] = useState<AcademiaConfigurada[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formConteudo, setFormConteudo] = useState("");
  const [formAtivo, setFormAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [origemId, setOrigemId] = useState("");
  const [nomeDoNovo, setNomeDoNovo] = useState("");
  const [congelando, setCongelando] = useState(false);

  const [modeloAplicarId, setModeloAplicarId] = useState("");
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ParceiroBusca[]>([]);
  const [alvo, setAlvo] = useState<ParceiroBusca | null>(null);
  const [sobrescrever, setSobrescrever] = useState(false);
  const [previa, setPrevia] = useState<RelatoAplicacao | null>(null);
  const [feito, setFeito] = useState<RelatoAplicacao | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [ms, as] = await Promise.all([listarModelos(), listarAcademias()]);
      setModelos(ms);
      setAcademias(as);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar os modelos");
    } finally {
      setCarregando(false);
    }
  }, [listarModelos, listarAcademias]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrirEditor = async (modelo: ModeloResumo) => {
    try {
      const { conteudo } = await obterConteudo({ data: { modeloId: modelo.id } });
      setEditandoId(modelo.id);
      setFormNome(modelo.nome);
      setFormDescricao(modelo.descricao || "");
      setFormAtivo(modelo.ativo);
      setFormConteudo(conteudo);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao abrir o modelo");
    }
  };

  const fecharEditor = () => {
    setEditandoId(null);
    setFormNome("");
    setFormDescricao("");
    setFormConteudo("");
    setFormAtivo(true);
  };

  const gravarEdicao = async () => {
    if (!formNome.trim()) return toast.error("Dê um nome ao modelo");
    setSalvando(true);
    try {
      await salvarModelo({
        data: {
          modeloId: editandoId,
          nome: formNome,
          descricao: formDescricao || null,
          conteudo: formConteudo,
          ativo: formAtivo,
        },
      });
      toast.success("Modelo salvo");
      fecharEditor();
      await recarregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar o modelo");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (modelo: ModeloResumo) => {
    if (!window.confirm(`Excluir o modelo "${modelo.nome}"? Isso não mexe nas academias já configuradas.`)) return;
    try {
      await excluirModelo({ data: { modeloId: modelo.id } });
      toast.success("Modelo excluído");
      await recarregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir");
    }
  };

  const congelar = async () => {
    if (!origemId) return toast.error("Escolha a academia de origem");
    if (nomeDoNovo.trim().length < 2) return toast.error("Dê um nome ao novo modelo");
    setCongelando(true);
    try {
      const origem = academias.find((a) => a.partnerId === origemId);
      await congelarAcademia({
        data: {
          partnerId: origemId,
          nome: nomeDoNovo,
          descricao: `Configuração de ${origem?.nome || "parceiro"} congelada em ${new Date().toLocaleDateString("pt-BR")}.`,
        },
      });
      toast.success("Academia salva como modelo");
      setNomeDoNovo("");
      await recarregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar como modelo");
    } finally {
      setCongelando(false);
    }
  };

  const procurar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busca.trim().length < 2) return;
    try {
      setAchados(await procurarParceiros({ data: { q: busca.trim() } }));
    } catch (err: any) {
      toast.error(err?.message || "Erro na busca");
    }
  };

  const escolherAlvo = (p: ParceiroBusca) => {
    setAlvo(p);
    setAchados([]);
    setPrevia(null);
    setFeito(null);
  };

  const rodar = async (simular: boolean) => {
    if (!alvo) return toast.error("Escolha o parceiro que vai receber o modelo");
    if (!modeloAplicarId) return toast.error("Escolha o modelo");
    if (
      !simular &&
      !window.confirm(
        `Aplicar o modelo em "${alvo.nome}" agora?${
          sobrescrever ? " Sobrescrever está LIGADO: o que já existe será atualizado." : ""
        }`,
      )
    ) {
      return;
    }
    setAplicando(true);
    try {
      const relato = await aplicar({
        data: { partnerId: alvo.id, modeloId: modeloAplicarId, sobrescrever, simular },
      });
      if (simular) {
        setPrevia(relato);
        setFeito(null);
      } else {
        setFeito(relato);
        setPrevia(null);
        toast.success("Modelo aplicado");
        await recarregar();
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao aplicar o modelo");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Academias</h1>
        <p className="text-sm text-muted-foreground">
          Modelos de configuração de academia. Salve uma academia que já funciona como modelo e aplique
          em um parceiro — catraca, planos, avisos e turmas de uma vez.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4" /> Modelos
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : modelos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo ainda. Salve uma academia que já funciona como modelo abaixo.
          </p>
        ) : (
          <div className="space-y-2">
            {modelos.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{m.nome}</span>
                    {!m.ativo && <Etiqueta acao="pulado" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.temConfig ? "catraca" : "sem catraca"} · {m.planos} planos · {m.avisos} avisos ·{" "}
                    {m.turmas} turmas
                    {m.origem ? ` · origem: ${m.origem}` : ""} · {fmtDataHora(m.updatedAt)}
                  </p>
                  {m.descricao && <p className="mt-1 text-xs text-muted-foreground">{m.descricao}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => abrirEditor(m)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                  >
                    Ver / editar
                  </button>
                  <button
                    onClick={() => apagar(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-destructive hover:bg-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editandoId !== null && (
          <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
                <input
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
                <input
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Conteúdo (JSON — uma seção por assunto)
              </label>
              <textarea
                value={formConteudo}
                onChange={(e) => setFormConteudo(e.target.value)}
                rows={16}
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={formAtivo} onChange={(e) => setFormAtivo(e.target.checked)} />
              Modelo ativo (só modelo ativo pode ser aplicado)
            </label>
            <div className="flex gap-2">
              <button
                onClick={gravarEdicao}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{" "}
                Salvar modelo
              </button>
              <button
                onClick={fecharEditor}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Camera className="h-4 w-4" /> Salvar a configuração de uma academia como modelo
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Congela catraca, planos, avisos e turmas de uma academia que já roda. O nome da academia de
          origem vira <code className="font-mono">{"{academia}"}</code> nos textos de aviso e volta a ser o
          nome certo na hora de aplicar.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={origemId}
            onChange={(e) => setOrigemId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Academia de origem...</option>
            {academias.map((a) => (
              <option key={a.partnerId} value={a.partnerId}>
                {a.nome || a.partnerId}
              </option>
            ))}
          </select>
          <input
            value={nomeDoNovo}
            onChange={(e) => setNomeDoNovo(e.target.value)}
            placeholder="Nome do novo modelo"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={congelar}
            disabled={congelando}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {congelando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar como modelo
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PlayCircle className="h-4 w-4" /> Aplicar um modelo em um parceiro
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Isso mexe em produção. Veja a prévia antes de confirmar.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={modeloAplicarId}
            onChange={(e) => {
              setModeloAplicarId(e.target.value);
              setPrevia(null);
              setFeito(null);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Escolha o modelo...</option>
            {modelos
              .filter((m) => m.ativo)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
          </select>

          <form onSubmit={procurar} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar o parceiro pelo nome"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              Buscar
            </button>
          </form>
        </div>

        {achados.length > 0 && (
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {achados.map((p) => (
              <button
                key={p.id}
                onClick={() => escolherAlvo(p)}
                className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-muted"
              >
                <span className="text-sm text-foreground">{p.nome || "Sem nome"}</span>
                <span className="text-xs text-muted-foreground">
                  {p.status} {p.jaEAcademia ? "· já é academia" : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {alvo && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
              <span className="text-sm font-semibold text-foreground">{alvo.nome || "Sem nome"}</span>
              {alvo.jaEAcademia && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> já é academia configurada
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sobrescrever}
                onChange={(e) => {
                  setSobrescrever(e.target.checked);
                  setPrevia(null);
                  setFeito(null);
                }}
              />
              Sobrescrever o que já existe (plano com mensalidade apontando para ele nunca é removido)
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => rodar(true)}
                disabled={aplicando}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {aplicando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ver prévia
              </button>
              <button
                onClick={() => rodar(false)}
                disabled={aplicando || !previa}
                title={previa ? "" : "Veja a prévia antes de aplicar"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Confirmar e aplicar
              </button>
            </div>

            {previa && <Relato relato={previa} />}
            {feito && <Relato relato={feito} />}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Parceiros que já são academia
        </div>
        {academias.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum parceiro tem configuração de acesso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Academia</th>
                  <th className="px-4 py-2 text-left">Fuso</th>
                  <th className="px-4 py-2 text-left">Catraca</th>
                  <th className="px-4 py-2 text-left">Planos</th>
                  <th className="px-4 py-2 text-left">Avisos</th>
                  <th className="px-4 py-2 text-left">Turmas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {academias.map((a) => (
                  <tr key={a.partnerId}>
                    <td className="px-4 py-2 text-foreground">{a.nome || a.partnerId}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.timezone}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.modeloCatraca || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.planos}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.avisos}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.turmas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
