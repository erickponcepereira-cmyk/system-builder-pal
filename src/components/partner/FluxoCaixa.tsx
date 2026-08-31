import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Loader2, Plus, Lock, Check, X, AlertTriangle, Wallet, Landmark, CreditCard,
} from "lucide-react";
import {
  caixaResumo, caixaPorDia, caixaPorCategoria, caixaExtrato,
  caixaContasECategorias, caixaLancar, caixaBaixar, caixaFechar,
  TIPOS_LANCAMENTO,
  type TipoLancamento, type ContaDoCaixa, type CategoriaDoCaixa, type ResumoDoCaixa,
  type MovimentoDoCaixa, type DiaDoCaixa, type FatiaDaCategoria,
} from "@/lib/academia-caixa.functions";
import {
  BOTAO_ACAO, BOTAO_NEUTRO, BOTAO_TEXTO, CAMPO, CAMPO_MINI,
  Bloco, Cartao, Campo, EYEBROW, FOCO, Pilula, ROTULO,
} from "@/components/partner/VisualAcademia";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Só a data, sem passar por fuso: `new Date("2026-08-01")` volta 31/07 no Brasil. */
const diaBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ICONE_DA_CONTA: Record<string, typeof Wallet> = {
  dinheiro: Wallet,
  banco: Landmark,
  maquininha: CreditCard,
};

export function FluxoCaixa({ partnerId }: { partnerId: string }) {
  const pedirResumo = useServerFn(caixaResumo);
  const pedirDias = useServerFn(caixaPorDia);
  const pedirCategorias = useServerFn(caixaPorCategoria);
  const pedirExtrato = useServerFn(caixaExtrato);
  const pedirContas = useServerFn(caixaContasECategorias);
  const lancar = useServerFn(caixaLancar);
  const baixar = useServerFn(caixaBaixar);
  const fechar = useServerFn(caixaFechar);

  // Mês corrente do relógio local; a régua de fuso de verdade é do banco.
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());

  const { de, ate } = useMemo(() => {
    const p = (n: number) => String(n).padStart(2, "0");
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    return { de: `${ano}-${p(mes + 1)}-01`, ate: `${ano}-${p(mes + 1)}-${p(ultimo)}` };
  }, [ano, mes]);

  const [resumo, setResumo] = useState<ResumoDoCaixa | null>(null);
  const [dias, setDias] = useState<DiaDoCaixa[]>([]);
  const [porCategoria, setPorCategoria] = useState<{
    saida: { itens: FatiaDaCategoria[]; total: number };
    entrada: { itens: FatiaDaCategoria[]; total: number };
  } | null>(null);
  const [extrato, setExtrato] = useState<MovimentoDoCaixa[]>([]);
  const [contas, setContas] = useState<ContaDoCaixa[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDoCaixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [contaFiltro, setContaFiltro] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [abrindoForm, setAbrindoForm] = useState(false);
  const [fechandoConta, setFechandoConta] = useState<ContaDoCaixa | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    Promise.all([
      pedirResumo({ data: { partnerId, de, ate } }),
      pedirDias({ data: { partnerId, de, ate } }),
      pedirCategorias({ data: { partnerId, de, ate } }),
      pedirExtrato({ data: { partnerId, de, ate, contaId: contaFiltro || null, limite: 120 } }),
      pedirContas({ data: { partnerId, ate } }),
    ])
      .then(([r, d, c, e, cc]) => {
        setResumo(r as ResumoDoCaixa);
        setDias(d as DiaDoCaixa[]);
        setPorCategoria(c as never);
        setExtrato(e as MovimentoDoCaixa[]);
        setContas((cc as { contas: ContaDoCaixa[] }).contas);
        setCategorias((cc as { categorias: CategoriaDoCaixa[] }).categorias);
      })
      .catch((erro: unknown) => toast.error(erro instanceof Error ? erro.message : "Não deu para carregar o caixa"))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, de, ate, contaFiltro]);

  useEffect(carregar, [carregar]);

  const andarMes = (passo: number) => {
    const d = new Date(ano, mes + passo, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  };

  const ehMesCorrente = ano === agora.getFullYear() && mes === agora.getMonth();

  const visiveis = soPendentes ? extrato.filter((m) => !m.pago) : extrato;

  if (carregando && !resumo) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-aca-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Somando o caixa...
      </div>
    );
  }

  const r = resumo;
  const maiorDia = Math.max(1, ...dias.map((d) => Math.max(d.entradas, d.saidas)));

  return (
    <div className="space-y-4">
      {/* ---------- o mês, e os três números que resumem ele ---------- */}
      <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => andarMes(-1)}
            className={`rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO}`}
            aria-label="Mês anterior">
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="font-bold text-aca-ink">{MESES[mes]}/{String(ano).slice(2)}</div>
            {!ehMesCorrente && (
              <button type="button" onClick={() => { setAno(agora.getFullYear()); setMes(agora.getMonth()); }}
                className={BOTAO_TEXTO}>
                voltar para o mês atual
              </button>
            )}
          </div>

          <button type="button" onClick={() => andarMes(1)}
            className={`rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO}`}
            aria-label="Próximo mês">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-aca-line pt-3 text-center">
          <div>
            <div className={ROTULO}>Entrou</div>
            <div className="mt-0.5 text-[15px] font-bold tabular-nums text-aca-ok">{brl(r?.entradas.total ?? 0)}</div>
          </div>
          <div>
            <div className={ROTULO}>Sobrou</div>
            <div className={`mt-0.5 text-[19px] font-bold tabular-nums ${(r?.lucro ?? 0) < 0 ? "text-aca-critico" : "text-aca-ink"}`}>
              {brl(r?.lucro ?? 0)}
            </div>
          </div>
          <div>
            <div className={ROTULO}>Saiu</div>
            <div className="mt-0.5 text-[15px] font-bold tabular-nums text-aca-ink">{brl(r?.saidas.total ?? 0)}</div>
          </div>
        </div>
      </div>

      {/* ---------- o que exige uma ação hoje ---------- */}
      {(r?.vencidas.quantidade ?? 0) > 0 && (
        <Bloco tom="critico" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-aca-ink">
            <AlertTriangle className="h-4 w-4 shrink-0 text-aca-critico" />
            <span>
              <strong>{r?.vencidas.quantidade}</strong> conta(s) venceram e não foram pagas —{" "}
              <strong className="tabular-nums">{brl(r?.vencidas.total ?? 0)}</strong>
            </span>
          </div>
          <button type="button" onClick={() => setSoPendentes(true)} className={BOTAO_TEXTO}>Ver quais ›</button>
        </Bloco>
      )}

      {(r?.pendentes.quantidade ?? 0) > 0 && (r?.vencidas.quantidade ?? 0) === 0 && (
        <Bloco tom="atencao" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-aca-ink">
            <strong>{r?.pendentes.quantidade}</strong> lançamento(s) ainda sem baixa —{" "}
            <strong className="tabular-nums">{brl(r?.pendentes.total ?? 0)}</strong>
          </span>
          <button type="button" onClick={() => setSoPendentes(true)} className={BOTAO_TEXTO}>Ver quais ›</button>
        </Bloco>
      )}

      {/* ---------- os números do período ---------- */}
      <div>
        <div className={`mb-2 ${EYEBROW}`}>O mês em números</div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Cartao rot="Entrou" valor={brl(r?.entradas.total ?? 0)} tom="ok"
            nota={`${r?.vendas.quantidade ?? 0} venda(s) no balcão`} />
          <Cartao rot="Saiu" valor={brl(r?.saidas.total ?? 0)} tom="neutro"
            nota={`${brl(r?.saidas.despesas ?? 0)} de despesa · ${brl(r?.saidas.retiradas ?? 0)} de retirada`} />
          <Cartao rot="Taxas" valor={brl(r?.vendas.taxas ?? 0)} tom="neutro"
            nota="já descontadas do que entrou" />
          <Cartao rot="Sobrou no mês" valor={brl(r?.lucro ?? 0)}
            tom={(r?.lucro ?? 0) < 0 ? "critico" : "ok"}
            nota={(r?.lucro ?? 0) < 0 ? "saiu mais do que entrou" : "entrou menos o que saiu"} />
        </div>
      </div>

      {/* ---------- movimento dia a dia ---------- */}
      {dias.length > 0 && (
        <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
          <div className={`mb-3 ${EYEBROW}`}>Movimento dia a dia</div>
          <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 120 }}>
            {dias.map((d) => {
              const eAlt = Math.round((d.entradas / maiorDia) * 96);
              const sAlt = Math.round((d.saidas / maiorDia) * 96);
              return (
                <div key={d.data} className="flex min-w-[10px] flex-1 flex-col items-center justify-end gap-[2px]"
                  title={`${diaBR(d.data)} · entrou ${brl(d.entradas)} · saiu ${brl(d.saidas)}`}>
                  <div className="w-full rounded-t-sm bg-aca-ok" style={{ height: Math.max(d.entradas > 0 ? 2 : 0, eAlt) }} />
                  <div className="w-full rounded-b-sm bg-aca-atencao" style={{ height: Math.max(d.saidas > 0 ? 2 : 0, sAlt) }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4 border-t border-aca-line pt-2 text-[11px] text-aca-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-aca-ok" /> entrou</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-aca-atencao" /> saiu</span>
            <span className="ml-auto tabular-nums">{diaBR(dias[0].data)} — {diaBR(dias[dias.length - 1].data)}</span>
          </div>
        </div>
      )}

      {/* ---------- onde o dinheiro está ---------- */}
      <div>
        <div className={`mb-2 flex items-center justify-between ${EYEBROW}`}>
          <span>Onde o dinheiro está</span>
          <span className="normal-case tracking-normal text-aca-fraco">saldo de hoje</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {contas.map((c) => {
            const Icone = ICONE_DA_CONTA[c.tipo] ?? Wallet;
            return (
              <Bloco key={c.conta_id} tom={c.saldo < 0 ? "critico" : "neutro"}
                className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icone className="h-4 w-4 shrink-0 text-aca-muted" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-aca-ink">{c.nome}</div>
                    <div className="text-[11px] text-aca-muted">
                      {c.fechado_ate ? `fechado até ${diaBR(c.fechado_ate)}` : "nunca fechado"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-[17px] font-bold tabular-nums ${c.saldo < 0 ? "text-aca-critico" : "text-aca-ink"}`}>
                    {brl(c.saldo)}
                  </span>
                  <button type="button" onClick={() => setFechandoConta(c)}
                    className={`rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO}`}
                    title="Fechar o caixa desta conta">
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Bloco>
            );
          })}
        </div>
      </div>

      {/* ---------- para onde foi ---------- */}
      {(porCategoria?.saida.itens.length ?? 0) > 0 && (
        <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
          <div className={`mb-3 ${EYEBROW}`}>Para onde o dinheiro foi</div>
          <div className="space-y-2">
            {porCategoria!.saida.itens.map((f) => {
              const parte = porCategoria!.saida.total > 0 ? (f.total / porCategoria!.saida.total) * 100 : 0;
              return (
                <div key={f.categoria_id ?? f.nome}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-aca-ink">{f.nome}</span>
                    <span className="shrink-0 tabular-nums text-aca-muted">
                      {brl(f.total)} <span className="text-aca-fraco">· {parte.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-aca-line-forte">
                    <div className="h-full rounded-full bg-aca-atencao" style={{ width: `${parte}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- lançar ---------- */}
      {abrindoForm ? (
        <FormLancamento
          contas={contas}
          categorias={categorias}
          aoFechar={() => setAbrindoForm(false)}
          aoSalvar={async (dados) => {
            await lancar({ data: { partnerId, ...dados } });
            toast.success("Lançado.");
            setAbrindoForm(false);
            carregar();
          }}
        />
      ) : (
        <button type="button" onClick={() => setAbrindoForm(true)} className={BOTAO_ACAO}>
          <Plus className="h-4 w-4" /> Lançar despesa, retirada ou aporte
        </button>
      )}

      {/* ---------- extrato ---------- */}
      <div>
        <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 ${EYEBROW}`}>
          <span>Tudo que entrou e saiu</span>
          <div className="flex items-center gap-2">
            <select value={contaFiltro} onChange={(e) => setContaFiltro(e.target.value)} className={CAMPO_MINI}>
              <option value="">Todas as contas</option>
              {contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}
            </select>
            <button type="button" onClick={() => setSoPendentes((v) => !v)}
              className={soPendentes ? BOTAO_TEXTO : `${BOTAO_TEXTO} !text-aca-muted`}>
              {soPendentes ? "mostrando só pendentes" : "só pendentes"}
            </button>
          </div>
        </div>

        {visiveis.length === 0 ? (
          <Bloco className="text-center text-sm text-aca-muted">
            {soPendentes ? "Nada pendente neste mês." : "Nenhum movimento neste mês."}
          </Bloco>
        ) : (
          <div className="divide-y divide-aca-line overflow-hidden rounded-xl border border-aca-line bg-aca-surface">
            {visiveis.map((m) => (
              <LinhaDoExtrato
                key={m.id}
                m={m}
                aoBaixar={async () => {
                  await baixar({ data: { partnerId, lancamentoId: m.id, pago: !m.pago } });
                  toast.success(m.pago ? "Voltou para pendente." : "Baixa dada.");
                  carregar();
                }}
              />
            ))}
          </div>
        )}
      </div>

      {fechandoConta && (
        <DialogoFechar
          conta={fechandoConta}
          ate={ate}
          aoFechar={() => setFechandoConta(null)}
          aoConfirmar={async (obs) => {
            const rel = await fechar({ data: { partnerId, contaId: fechandoConta.conta_id, ate, observacao: obs } });
            const saldo = (rel as { saldo_apurado?: number })?.saldo_apurado;
            toast.success(`Caixa fechado${saldo !== undefined ? ` com ${brl(saldo)}` : ""}.`);
            setFechandoConta(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

/**
 * Uma linha do extrato.
 *
 * Venda e lançamento moram na mesma lista de propósito: quem olha o caixa quer
 * ver o dinheiro andando, não descobrir em qual das duas telas cada metade
 * estava. A origem aparece na etiqueta, e só venda não tem baixa — ela já
 * nasceu paga.
 */
function LinhaDoExtrato({ m, aoBaixar }: { m: MovimentoDoCaixa; aoBaixar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const entrada = m.direcao === "entrada";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-aca-alto">
      <span aria-hidden className={`h-8 w-[3px] shrink-0 rounded-full ${entrada ? "bg-aca-ok" : "bg-aca-atencao"}`} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-aca-ink">{m.descricao}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-aca-muted">
          <span className="tabular-nums">{diaBR(m.data)}</span>
          {m.conta_nome && <span>· {m.conta_nome}</span>}
          {m.categoria_nome && <span>· {m.categoria_nome}</span>}
          {m.origem === "venda" && <span>· venda</span>}
        </div>
      </div>

      {!m.pago && <Pilula tom="atencao">pendente</Pilula>}

      <span className={`shrink-0 text-sm font-bold tabular-nums ${entrada ? "text-aca-ok" : "text-aca-ink"}`}>
        {entrada ? "" : "−"}{brl(m.liquido)}
      </span>

      {m.origem === "lancamento" && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => { setOcupado(true); aoBaixar().finally(() => setOcupado(false)); }}
          className={`shrink-0 rounded-lg p-1.5 ${FOCO} ${m.pago ? "text-aca-muted hover:bg-aca-alto" : "text-aca-ok hover:bg-aca-alto"}`}
          title={m.pago ? "Voltar para pendente" : "Dar baixa"}
        >
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : m.pago ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

function FormLancamento({ contas, categorias, aoFechar, aoSalvar }: {
  contas: ContaDoCaixa[];
  categorias: CategoriaDoCaixa[];
  aoFechar: () => void;
  aoSalvar: (d: {
    contaId: string; tipo: TipoLancamento; valor: number; descricao: string;
    competencia: string | null; categoriaId: string | null; pago: boolean; contaDestinoId: string | null;
  }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoLancamento>("saida");
  const [contaId, setContaId] = useState(contas[0]?.conta_id ?? "");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 10));
  const [pago, setPago] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const ehTransferencia = tipo === "transferencia";
  const ladoDaCategoria = tipo === "entrada" || tipo === "aporte" ? "entrada" : "saida";
  const categoriasDoLado = categorias.filter((c) => c.tipo === ladoDaCategoria);

  const enviar = () => {
    const n = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return toast.error("Informe um valor maior que zero");
    if (!descricao.trim()) return toast.error("Diga do que se trata");
    if (!contaId) return toast.error("Escolha a conta");
    if (ehTransferencia && !contaDestinoId) return toast.error("Escolha a conta de destino");
    if (ehTransferencia && contaDestinoId === contaId) return toast.error("Origem e destino precisam ser contas diferentes");

    setSalvando(true);
    aoSalvar({
      contaId, tipo, valor: n, descricao: descricao.trim(),
      competencia, categoriaId: ehTransferencia ? null : categoriaId || null,
      pago: ehTransferencia ? true : pago,
      contaDestinoId: ehTransferencia ? contaDestinoId : null,
    })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para lançar"))
      .finally(() => setSalvando(false));
  };

  return (
    <div className="space-y-3 rounded-xl border border-aca-line bg-aca-surface p-4">
      <div className="flex items-center justify-between">
        <span className={EYEBROW}>Novo lançamento</span>
        <button type="button" onClick={aoFechar} className={BOTAO_TEXTO}>cancelar</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TIPOS_LANCAMENTO.map((t) => (
          <button key={t.value} type="button" onClick={() => setTipo(t.value)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${FOCO} ${
              tipo === t.value ? "bg-aca-acao text-white" : "bg-aca-alto text-aca-muted hover:text-aca-ink"
            }`}
            title={t.ajuda}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Campo label="Valor">
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal"
            placeholder="0,00" className={`${CAMPO} w-full tabular-nums`} />
        </Campo>
        <Campo label="Do que se trata">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="Aluguel de setembro" className={`${CAMPO} w-full`} />
        </Campo>
        <Campo label={ehTransferencia ? "Sai de" : "Conta"}>
          <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={`${CAMPO} w-full`}>
            {contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}
          </select>
        </Campo>

        {ehTransferencia ? (
          <Campo label="Entra em">
            <select value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} className={`${CAMPO} w-full`}>
              <option value="">Escolha...</option>
              {contas.filter((c) => c.conta_id !== contaId).map((c) => (
                <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo label="Categoria">
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`${CAMPO} w-full`}>
              <option value="">Sem categoria</option>
              {categoriasDoLado.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}

        <Campo label="Data">
          <input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className={`${CAMPO} w-full`} />
        </Campo>

        {!ehTransferencia && (
          <Campo label="Situação">
            <label className="flex h-[42px] items-center gap-2 text-sm text-aca-ink">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} />
              {pago ? "Já foi pago" : "Ainda vai pagar"}
            </label>
          </Campo>
        )}
      </div>

      <button type="button" onClick={enviar} disabled={salvando} className={BOTAO_ACAO}>
        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Lançar
      </button>
    </div>
  );
}

/**
 * Fechar o caixa.
 *
 * O texto insiste que nada é apagado porque "zerar o caixa" soa como apagar —
 * e alguém que acredita nisso deixa de fechar com medo de perder o histórico.
 */
function DialogoFechar({ conta, ate, aoFechar, aoConfirmar }: {
  conta: ContaDoCaixa; ate: string; aoFechar: () => void; aoConfirmar: (obs: string | null) => Promise<void>;
}) {
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-aca-line bg-aca-surface p-5">
        <div className="text-base font-bold text-aca-ink">Fechar o caixa de {conta.nome}</div>
        <p className="text-sm text-aca-muted">
          Grava o saldo de <strong className="tabular-nums text-aca-ink">{brl(conta.saldo)}</strong> como marco
          em {diaBR(ate)}. A partir daí os saldos passam a contar do zero.
        </p>
        <p className="text-[12px] text-aca-fraco">
          Nada é apagado: todo o histórico continua no extrato, e você pode navegar pelos meses anteriores como sempre.
        </p>

        <Campo label="Observação (opcional)">
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Conferi com o dinheiro na gaveta"
            className={`${CAMPO} w-full`} />
        </Campo>

        <div className="flex gap-2">
          <button type="button" onClick={aoFechar} className={`${BOTAO_NEUTRO} flex-1`}>Cancelar</button>
          <button type="button" disabled={ocupado} className={`${BOTAO_ACAO} flex-1`}
            onClick={() => { setOcupado(true); aoConfirmar(obs.trim() || null).finally(() => setOcupado(false)); }}>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Fechar caixa
          </button>
        </div>
      </div>
    </div>
  );
}

export default FluxoCaixa;
