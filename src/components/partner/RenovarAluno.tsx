import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addDaysISO, formatDateOnlyBR, todayISOLocal } from "@/lib/date-only";
import {
  FORMAS_PAGAMENTO,
  listarPlanosAcademia,
  renovarMensalidadeAcademia,
  type FormaPagamento,
} from "@/lib/academia-teste.functions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (s: string) => Number(String(s).replace(",", ".")) || 0;

/** Base da contagem: quem renova adiantado não perde os dias que já pagou. */
const baseDaRenovacao = (vencimentoAtual?: string | null) => {
  const hoje = todayISOLocal();
  return vencimentoAtual && vencimentoAtual > hoje ? vencimentoAtual : hoje;
};

/**
 * Renovar uma pessoa em um passo.
 *
 * Era a operação mais comum da academia e a única impossível pela tela: o
 * lançamento antigo exigia aluno da plataforma, e 400 das 401 pessoas só
 * existem como credencial do leitor.
 *
 * O plano traz o preço de tabela já preenchido, e o valor continua editável —
 * desconto de balcão é regra, não exceção. O pagamento pode ser dividido entre
 * formas, porque metade no pix e metade no cartão é o que de fato acontece no
 * balcão, e cada forma tem a sua taxa.
 *
 * A validade também é sugestão: o plano define os dias (30, 90…), e a recepção
 * pode ajustar a data antes de confirmar.
 */
export function RenovarAluno({
  partnerId, credencialId, studentId, nome, vencimentoAtual, aoConcluir, aoCancelar,
}: {
  partnerId: string;
  credencialId: string | null;
  studentId: string | null;
  nome: string;
  vencimentoAtual?: string | null;
  aoConcluir: () => void;
  aoCancelar: () => void;
}) {
  const listarPlanos = useServerFn(listarPlanosAcademia);
  const renovar = useServerFn(renovarMensalidadeAcademia);
  const [planos, setPlanos] = useState<Array<{ id: string; nome: string; valor_padrao: number; dias: number }>>([]);
  const [planoId, setPlanoId] = useState("");
  const [validoAte, setValidoAte] = useState("");
  const [partes, setPartes] = useState<Array<{ forma: FormaPagamento; valor: string }>>([
    { forma: "pix", valor: "" },
  ]);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [cortesiaManual, setCortesiaManual] = useState(false);

  useEffect(() => {
    let vivo = true;
    listarPlanos({ data: { partnerId } })
      .then((r) => {
        if (!vivo) return;
        setPlanos(r.planos);
        const primeiro = r.planos[0];
        if (primeiro) {
          setPlanoId(primeiro.id);
          setPartes([{ forma: "pix", valor: String(primeiro.valor_padrao) }]);
          setValidoAte(addDaysISO(baseDaRenovacao(vencimentoAtual), Number(primeiro.dias) || 30));
        }
      })
      .catch(() => toast.error("Não consegui carregar os planos."));
    return () => { vivo = false; };
  }, [partnerId]);

  const plano = planos.find((p) => p.id === planoId) ?? null;
  const total = partes.reduce((s, p) => s + numero(p.valor), 0);

  /*
   * Cortesia é lançamento de valor ZERO, e é legítimo.
   *
   * A trava de "informe o valor" existe para pegar quem esqueceu de digitar —
   * lançamento sem valor por engano vira receita perdida que ninguém reconcilia
   * depois. Mas ela também barrava o plano gratuito, que é justamente um plano
   * cujo valor é zero de propósito.
   *
   * Então a trava continua, e ganha uma saída explícita: plano de tabela zero
   * já entra como cortesia, e qualquer plano pode virar cortesia com um clique.
   * O que não dá é salvar zero sem dizer que é de graça.
   */
  const planoEhGratuito = Boolean(plano) && Number(plano?.valor_padrao ?? 0) === 0;
  const cortesia = cortesiaManual || planoEhGratuito;
  const tabela = Number(plano?.valor_padrao ?? 0);
  const difere = Boolean(plano) && Math.abs(total - tabela) > 0.005;

  const escolherPlano = (id: string) => {
    setPlanoId(id);
    const p = planos.find((x) => x.id === id);
    // Trocar de plano repõe o preço de tabela numa parte só. Manter a divisão
    // anterior deixaria a soma errada sem ninguém perceber.
    if (p) {
      setPartes([{ forma: partes[0]?.forma ?? "pix", valor: String(p.valor_padrao) }]);
      setValidoAte(addDaysISO(baseDaRenovacao(vencimentoAtual), Number(p.dias) || 30));
    }
  };


  const confirmar = async () => {
    if (!plano) { toast.error("Escolha o plano."); return; }
    const pagamentos = partes
      .map((p) => ({ forma: p.forma, valor: numero(p.valor) }))
      .filter((p) => p.valor > 0);
    if (pagamentos.length === 0 && !cortesia) {
      toast.error("Informe o valor recebido — ou marque como cortesia.");
      return;
    }

    setSalvando(true);
    try {
      const r = await renovar({
        data: {
          partnerId, credencialId, studentId,
          plano: plano.nome, dias: plano.dias, pagamentos,
          // O servidor tem a MESMA trava, e por bom motivo: a tela pode ser
          // contornada. Sem mandar a bandeira, o lançamento de graça era
          // recusado lá mesmo com a caixa marcada aqui.
          cortesia,
          // A observação guarda que foi de graça. Sem isso, um lançamento de
          // R$ 0,00 no fechamento do mês não se distingue de um erro de
          // digitação, e alguém vai gastar a tarde tentando descobrir.
          observacao: [obs.trim(), cortesia && pagamentos.length === 0 ? "Cortesia: sem cobrança." : ""]
            .filter(Boolean).join(" ") || undefined,
          validoAte: validoAte || null,
        },
      });
      const ate = new Date(`${r.valido_ate}T12:00:00`).toLocaleDateString("pt-BR");
      toast.success(`Renovado até ${ate} · líquido ${brl(Number(r.liquido))}`);
      aoConcluir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível renovar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-aca-line pt-3">
      <p className="text-[11px] text-aca-muted">
        Lançando <strong className="text-aca-ink">{nome}</strong>. Os dias entram
        <strong className="text-aca-ink"> a partir do vencimento atual</strong> quando ele ainda não passou
        {vencimentoAtual ? ` (hoje vence ${formatDateOnlyBR(vencimentoAtual)})` : ""}.
      </p>


      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-aca-fraco">Plano</p>
        <div className="flex flex-wrap gap-1.5">
          {planos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolherPlano(p.id)}
              className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] ${
                p.id === planoId
                  ? "bg-aca-acao text-aca-acao-ink"
                  : "border border-aca-line bg-aca-alto text-aca-ink hover:bg-aca-line"
              }`}
            >
              <span className="block font-bold">{p.nome}</span>
              <span className="block opacity-80">{brl(Number(p.valor_padrao))} · {p.dias} dias</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-aca-fraco">Válido até</p>
        <input
          value={validoAte}
          onChange={(e) => setValidoAte(e.target.value)}
          type="date"
          aria-label="Válido até"
          className="w-full rounded-lg border border-aca-line bg-aca-alto px-2.5 py-1.5 text-xs text-aca-ink"
        />
        <p className="mt-1 text-[11px] text-aca-muted">
          Preenchido pelo plano ({plano ? `${plano.dias} dias` : "—"}); pode ajustar na mão.
        </p>
      </div>



      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-aca-fraco">Como recebeu</p>
          <button
            type="button"
            onClick={() => setPartes((a) => [...a, { forma: "dinheiro", valor: "" }])}
            className="rounded px-2 py-0.5 text-[10px] font-bold text-aca-acao hover:bg-aca-line"
          >
            + dividir
          </button>
        </div>

        <div className="space-y-1.5">
          {partes.map((p, i) => (
            <div key={i} className="flex gap-1.5">
              <select
                value={p.forma}
                onChange={(e) =>
                  setPartes((a) => a.map((x, j) => (j === i ? { ...x, forma: e.target.value as FormaPagamento } : x)))
                }
                className="flex-1 rounded-lg border border-aca-line bg-aca-alto px-2 py-1.5 text-xs text-aca-ink"
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <input
                value={p.valor}
                onChange={(e) => setPartes((a) => a.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Valor recebido nesta forma"
                className="w-24 rounded-lg border border-aca-line bg-aca-alto px-2 py-1.5 text-xs text-aca-ink placeholder:text-aca-fraco"
              />
              {partes.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPartes((a) => a.filter((_, j) => j !== i))}
                  aria-label="Remover esta forma de pagamento"
                  className="rounded px-2 text-aca-fraco hover:bg-aca-line hover:text-aca-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Diferença é aviso, não bloqueio: desconto e acréscimo de balcão são
            legítimos, e o que vale é o que a recepção recebeu de fato. */}
        <p className={`mt-1 text-[11px] ${difere ? "text-aca-atencao" : "text-aca-muted"}`}>
          Total {brl(total)}{difere ? ` · tabela é ${brl(tabela)}` : ""}
        </p>
      </div>

      <input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação (opcional)"
        className="w-full rounded-lg border border-aca-line bg-aca-alto px-2.5 py-1.5 text-xs text-aca-ink placeholder:text-aca-fraco"
      />

      <label className="flex items-start gap-2 rounded-lg border border-aca-line bg-aca-alto p-2">
        <input
          type="checkbox"
          checked={cortesia}
          disabled={planoEhGratuito}
          onChange={(e) => setCortesiaManual(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        />
        <span className="text-[11px] text-aca-muted">
          <strong className="text-aca-ink">Cortesia — sem cobrança</strong>
          {planoEhGratuito
            ? " · este plano é gratuito, então já entra assim"
            : " · lança com R$ 0,00 e libera o acesso igual"}
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando || (total <= 0 && !cortesia)}
          className="flex-1 rounded-lg bg-aca-acao px-3 py-2 text-xs font-bold text-aca-acao-ink disabled:opacity-50"
        >
          {salvando ? "Registrando…" : "Confirmar renovação"}
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-lg border border-aca-line px-3 py-2 text-xs text-aca-muted hover:bg-aca-line"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
