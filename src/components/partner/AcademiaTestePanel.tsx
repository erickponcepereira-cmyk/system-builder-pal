import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, Save, Dumbbell, Ban } from "lucide-react";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import {
  FORMAS_PAGAMENTO,
  buscarAlunosParaMensalidade,
  cancelarMensalidadeAcademia,
  listarAlunosAcademia,
  obterConfigAcademia,
  previewTaxaAcademia,
  registrarMensalidadeAcademia,
  salvarConfigAcademia,
  type FormaPagamento,
} from "@/lib/academia-teste.functions";

type SubAba = "alunos" | "mensalidade" | "config";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Chaveado pelos motivos que a função acesso_classificar devolve, para a tela
// não manter uma segunda versão da régua.
const ESTADOS: Record<string, { label: string; cls: string }> = {
  contrato_ativo: { label: "Ativo", cls: "bg-green-500/15 text-green-400" },
  vencimento_proximo: { label: "Vence em breve", cls: "bg-amber-500/15 text-amber-400" },
  em_carencia: { label: "Em carência", cls: "bg-orange-500/15 text-orange-400" },
  vencido_bloqueado: { label: "Bloqueado", cls: "bg-red-500/15 text-red-400" },
  sem_mensalidade: { label: "Sem mensalidade", cls: "bg-white/10 text-white/60" },
};

export function AcademiaTestePanel({ partnerId }: { partnerId: string }) {
  const [sub, setSub] = useState<SubAba>("alunos");

  return (
    <TestSurfaceGate>
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <Dumbbell className="h-4 w-4 text-primary" /> Academia (teste)
          </p>
          <p className="text-[11px] text-white/50">
            Superfície de teste — visível apenas para admin master. A academia só monitora a frequência; o aluno continua do coach responsável.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {([
            ["alunos", "Alunos da academia"],
            ["mensalidade", "Registrar / renovar"],
            ["config", "Configurações"],
          ] as [SubAba, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSub(k)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${sub === k ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {sub === "alunos" && <ListaAlunos partnerId={partnerId} />}
        {sub === "mensalidade" && <FormMensalidade partnerId={partnerId} />}
        {sub === "config" && <ConfigAcademia partnerId={partnerId} />}
      </div>
    </TestSurfaceGate>
  );
}

function ListaAlunos({ partnerId }: { partnerId: string }) {
  const listar = useServerFn(listarAlunosAcademia);
  const cancelar = useServerFn(cancelarMensalidadeAcademia);
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Array<{
    id: string; nome: string; plano: string; valido_ate: string;
    dias_restantes: number | null; decisao: string; motivo: string; valor: number;
  }>>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  // id do lançamento com o formulário de cancelamento aberto
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [tipoCancel, setTipoCancel] = useState<"cancelada" | "estornada">("cancelada");
  const [motivo, setMotivo] = useState("");
  const [salvandoCancel, setSalvandoCancel] = useState(false);

  const fecharCancelamento = () => {
    setAbertoId(null);
    setMotivo("");
    setTipoCancel("cancelada");
  };

  const confirmarCancelamento = async (mensalidadeId: string) => {
    if (motivo.trim().length < 3) {
      toast.error("Descreva o motivo do cancelamento.");
      return;
    }
    setSalvandoCancel(true);
    try {
      await cancelar({ data: { partnerId, mensalidadeId, status: tipoCancel, motivo: motivo.trim() } });
      // O lançamento sai da lista porque ela mostra apenas os ativos; a linha
      // continua existindo no banco para o histórico financeiro.
      setLinhas((atual) => atual.filter((l) => l.id !== mensalidadeId));
      fecharCancelamento();
      toast.success(tipoCancel === "estornada" ? "Lançamento estornado." : "Lançamento cancelado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
    } finally {
      setSalvandoCancel(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listar({ data: { partnerId } })
      .then((r) => { if (alive) setLinhas(r.alunos as never); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [partnerId]);

  const visiveis = useMemo(() => linhas.filter((l) =>
    (filtro === "todos" || l.motivo === filtro) &&
    (!busca.trim() || l.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  ), [linhas, filtro, busca]);

  if (loading) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40"
          />
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-2 text-sm text-white"
        >
          <option value="todos">Todos</option>
          <option value="contrato_ativo">Ativos</option>
          <option value="vencimento_proximo">Vence em breve</option>
          <option value="em_carencia">Em carência</option>
          <option value="vencido_bloqueado">Bloqueados</option>
        </select>
      </div>

      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">Nenhum aluno com mensalidade nesta academia.</p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((l) => {
            const e = ESTADOS[l.motivo] ?? ESTADOS["sem_mensalidade"];
            return (
              <div key={l.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{l.nome}</p>
                    <p className="text-[11px] text-white/50">{l.plano} · {brl(Number(l.valor) || 0)}</p>
                    <p className="text-[11px] text-white/50">
                      Válido até {new Date(`${l.valido_ate}T12:00:00`).toLocaleDateString("pt-BR")}
                      {l.dias_restantes !== null && (
                        l.dias_restantes >= 0
                          ? ` · ${l.dias_restantes} dia(s) restante(s)`
                          : ` · ${Math.abs(l.dias_restantes)} dia(s) vencido(s)`
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${e.cls}`}>{e.label}</span>
                    {abertoId !== l.id && (
                      <button
                        type="button"
                        onClick={() => { setAbertoId(l.id); setMotivo(""); setTipoCancel("cancelada"); }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                      >
                        <Ban className="h-3 w-3" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>

                {abertoId === l.id && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[11px] text-white/60">
                      O lançamento continua no histórico financeiro e deixa de valer para acesso.
                      {l.decisao === "liberado" && " Este aluno perde a liberação imediatamente."}
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={tipoCancel}
                        onChange={(ev) => setTipoCancel(ev.target.value as "cancelada" | "estornada")}
                        className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
                      >
                        <option value="cancelada">Cancelado</option>
                        <option value="estornada">Estornado</option>
                      </select>
                      <input
                        value={motivo}
                        onChange={(ev) => setMotivo(ev.target.value)}
                        placeholder="Motivo (obrigatório)"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={fecharCancelamento}
                        disabled={salvandoCancel}
                        className="rounded-xl px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmarCancelamento(l.id)}
                        disabled={salvandoCancel}
                        className="flex items-center gap-1.5 rounded-xl bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        {salvandoCancel ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormMensalidade({ partnerId }: { partnerId: string }) {
  const buscar = useServerFn(buscarAlunosParaMensalidade);
  const preview = useServerFn(previewTaxaAcademia);
  const registrar = useServerFn(registrarMensalidadeAcademia);

  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<Array<{ studentId: string; nome: string }>>([]);
  const [aluno, setAluno] = useState<{ studentId: string; nome: string } | null>(null);
  const [plano, setPlano] = useState("Mensal");
  const [valor, setValor] = useState(0);
  const [origem, setOrigem] = useState<"interna" | "externa">("externa");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [validoAte, setValidoAte] = useState("");
  const [obs, setObs] = useState("");
  const [taxa, setTaxa] = useState<{ taxaPercentual: number; taxaValor: number; valorLiquido: number; fonte: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (termo.trim().length < 3) { setOpcoes([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } })
        .then((r) => { if (alive) setOpcoes(r.alunos); })
        .catch(() => {});
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [termo, partnerId]);

  useEffect(() => {
    let alive = true;
    preview({ data: { partnerId, origem, formaPagamento: forma, valor } })
      .then((r) => { if (alive) setTaxa(r); })
      .catch(() => { if (alive) setTaxa(null); });
    return () => { alive = false; };
  }, [partnerId, origem, forma, valor]);

  const fonteTexto = taxa?.fonte === "dinheiro" ? "Dinheiro — sem taxa"
    : taxa?.fonte === "plataforma" ? "Taxa automática da plataforma"
    : taxa?.fonte === "academia" ? "Taxa configurada pela academia"
    : "Taxa não configurada para esta forma de pagamento — usando zero";

  const salvar = async () => {
    if (!aluno) return toast.error("Escolha o aluno.");
    if (!validoAte) return toast.error("Informe a nova validade.");
    if (!plano.trim()) return toast.error("Informe o plano.");
    setSalvando(true);
    try {
      await registrar({ data: { partnerId, studentId: aluno.studentId, plano, valor, validoAte, origem, formaPagamento: forma, observacao: obs || undefined } });
      toast.success("Mensalidade registrada.");
      setAluno(null); setTermo(""); setObs(""); setValor(0); setValidoAte("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <Campo label="Aluno">
        {aluno ? (
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-sm text-white">{aluno.nome}</span>
            <button onClick={() => setAluno(null)} className="text-[11px] text-primary">trocar</button>
          </div>
        ) : (
          <>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Digite ao menos 3 letras do nome"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            {opcoes.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#141414]">
                {opcoes.map((o) => (
                  <button key={o.studentId} onClick={() => { setAluno(o); setOpcoes([]); }} className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                    {o.nome}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Campo>

      <Campo label="Plano">
        <input value={plano} onChange={(e) => setPlano(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
      </Campo>

      <Campo label="Valor">
        <CurrencyInputBRL value={valor} onChange={setValor} />
      </Campo>

      <Campo label="Origem da venda">
        <select value={origem} onChange={(e) => setOrigem(e.target.value as "interna" | "externa")} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
          <option value="interna">Interna (vendida na plataforma)</option>
          <option value="externa">Externa (vendida na recepção)</option>
        </select>
      </Campo>

      <Campo label="Forma de pagamento">
        <select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
          {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </Campo>

      <Campo label="Válido até">
        <input type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
      </Campo>

      <Campo label="Observação">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
      </Campo>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
        <p className="text-[11px] uppercase tracking-wider text-white/40">Resumo</p>
        <p>Taxa: {taxa ? `${Number(taxa.taxaPercentual).toFixed(2)}% · ${brl(taxa.taxaValor)}` : "—"}</p>
        <p>Valor líquido: <span className="font-bold text-white">{taxa ? brl(taxa.valorLiquido) : "—"}</span></p>
        <p className={`text-[11px] ${taxa?.fonte === "nao_configurada" ? "text-amber-400" : "text-white/50"}`}>{fonteTexto}</p>
      </div>

      <button onClick={salvar} disabled={salvando} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Registrar mensalidade
      </button>
    </div>
  );
}

function ConfigAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterConfigAcademia);
  const salvarFn = useServerFn(salvarConfigAcademia);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [carencia, setCarencia] = useState(3);
  const [exigeSenha, setExigeSenha] = useState(false);
  const [regra, setRegra] = useState("uma_vez_na_vida");
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [catraca, setCatraca] = useState("");
  const [taxas, setTaxas] = useState<Record<string, { pct: number; fixa: number }>>({});

  useEffect(() => {
    let alive = true;
    obter({ data: { partnerId } })
      .then((r) => {
        if (!alive) return;
        setCarencia(r.config.dias_carencia);
        setExigeSenha(r.config.exige_senha_liberacao);
        setRegra(r.config.regra_dayuse);
        setTz(r.config.timezone);
        setCatraca(r.config.modelo_catraca ?? "");
        const m: Record<string, { pct: number; fixa: number }> = {};
        for (const t of r.taxas) m[t.forma_pagamento] = { pct: Number(t.taxa_percentual), fixa: Number(t.taxa_fixa) };
        setTaxas(m);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [partnerId]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarFn({ data: {
        partnerId, diasCarencia: carencia, exigeSenha, regraDayuse: regra, timezone: tz,
        modeloCatraca: catraca.trim() || null,
        taxas: FORMAS_PAGAMENTO.filter((f) => f.value !== "dinheiro").map((f) => ({
          forma_pagamento: f.value,
          taxa_percentual: taxas[f.value]?.pct ?? 0,
          taxa_fixa: taxas[f.value]?.fixa ?? 0,
        })),
      } });
      toast.success("Configurações salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-3">
      <Campo label="Dias de carência após o vencimento">
        <input type="number" min={0} value={carencia} onChange={(e) => setCarencia(Number(e.target.value) || 0)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
      </Campo>

      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={exigeSenha} onChange={(e) => setExigeSenha(e.target.checked)} />
        Exigir senha para liberação manual
      </label>

      <Campo label="Regra de day use">
        <select value={regra} onChange={(e) => setRegra(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
          <option value="uma_vez_na_vida">Uma vez na vida</option>
          <option value="uma_vez_por_mes">Uma vez por mês</option>
          <option value="livre_com_registro">Livre com registro</option>
          <option value="desativado">Desativado</option>
        </select>
      </Campo>

      <Campo label="Fuso horário">
        <input value={tz} onChange={(e) => setTz(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
      </Campo>

      <Campo label="Modelo de catraca (opcional)">
        <input value={catraca} onChange={(e) => setCatraca(e.target.value)} placeholder="ex.: controlid_idblock" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40" />
      </Campo>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-white/40">Taxas da venda externa</p>
        <div className="space-y-2">
          {FORMAS_PAGAMENTO.filter((f) => f.value !== "dinheiro").map((f) => (
            <div key={f.value} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-xs text-white/70">{f.label}</span>
              <input
                type="number" step="0.01" placeholder="%"
                value={taxas[f.value]?.pct ?? 0}
                onChange={(e) => setTaxas((p) => ({ ...p, [f.value]: { pct: Number(e.target.value) || 0, fixa: p[f.value]?.fixa ?? 0 } }))}
                className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
              />
              <input
                type="number" step="0.01" placeholder="R$ fixo"
                value={taxas[f.value]?.fixa ?? 0}
                onChange={(e) => setTaxas((p) => ({ ...p, [f.value]: { pct: p[f.value]?.pct ?? 0, fixa: Number(e.target.value) || 0 } }))}
                className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
              />
            </div>
          ))}
        </div>
      </div>

      <button onClick={salvar} disabled={salvando} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar configurações
      </button>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      {children}
    </div>
  );
}

export default AcademiaTestePanel;
