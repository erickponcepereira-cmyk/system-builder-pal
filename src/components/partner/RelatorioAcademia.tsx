import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { relatorioAcademia, FORMAS_PAGAMENTO } from "@/lib/academia-teste.functions";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const rotuloForma = (v: string) => FORMAS_PAGAMENTO.find((f) => f.value === v)?.label ?? v;

type Dados = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof relatorioAcademia>>>>;

/** Primeiro e último dia do mês corrente, em ISO. */
function mesCorrente() {
  const h = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    de: `${h.getFullYear()}-${p(h.getMonth() + 1)}-01`,
    ate: `${h.getFullYear()}-${p(h.getMonth() + 1)}-${p(h.getDate())}`,
  };
}

function Cartao({ rot, valor, nota, tom }: { rot: string; valor: string; nota?: string; tom?: "ok" | "alerta" }) {
  const cor = tom === "ok" ? "text-emerald-400" : tom === "alerta" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{rot}</p>
      <p className={`text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
      {nota && <p className="text-[11px] text-white/50">{nota}</p>}
    </div>
  );
}

export function RelatorioAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(relatorioAcademia);
  const inicial = mesCorrente();
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = (d: string, a: string) => {
    setCarregando(true);
    obter({ data: { partnerId, de: d, ate: a } })
      .then((r) => setDados(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui carregar o relatório."))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(de, ate); }, [partnerId]);

  if (carregando && !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;
  if (!dados) return null;

  const f = dados.financeiro;
  const s = dados.situacao;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white" />
        </label>
        <button type="button" onClick={() => carregar(de, ate)} disabled={carregando}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-black disabled:opacity-50">
          {carregando ? "Carregando…" : "Ver"}
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Dinheiro no período</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cartao rot="Recebido" valor={brl(f.bruto)} nota={`${f.lancamentos} lançamento(s)`} />
          <Cartao rot="Taxas" valor={brl(f.taxas)} tom={Number(f.taxas) > 0 ? "alerta" : undefined}
            nota={Number(f.bruto) > 0 ? `${((Number(f.taxas) / Number(f.bruto)) * 100).toFixed(2)}% do bruto` : "maquininha"} />
          <Cartao rot="Líquido" valor={brl(f.liquido)} tom="ok" nota="o que sobra" />
          <Cartao rot="Vencem em 7 dias" valor={String(dados.vencem_em_7)} nota="lista da recepção" />
        </div>
        {Number(f.bruto) === 0 && (
          <p className="mt-2 text-[11px] text-white/50">
            Nenhum lançamento com valor neste período. As mensalidades importadas do sistema antigo
            entraram com valor zero — o dinheiro passa a aparecer a partir da primeira renovação feita por aqui.
          </p>
        )}
      </div>

      {dados.por_forma.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Por forma de pagamento</h3>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                <tr><th className="p-2 text-left">Forma</th><th className="p-2 text-right">Recebido</th>
                    <th className="p-2 text-right">Taxa</th><th className="p-2 text-right">Líquido</th></tr>
              </thead>
              <tbody>
                {dados.por_forma.map((l) => (
                  <tr key={l.forma} className="border-t border-white/5">
                    <td className="p-2">{rotuloForma(l.forma)}</td>
                    <td className="p-2 text-right tabular-nums">{brl(l.bruto)}</td>
                    <td className="p-2 text-right tabular-nums text-amber-300">{brl(l.taxas)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-400">{brl(l.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dados.por_plano.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Por plano</h3>
          <div className="space-y-1">
            {dados.por_plano.map((p) => (
              <div key={p.plano} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                <span className="min-w-0 truncate">{p.plano}</span>
                <span className="shrink-0 tabular-nums text-white/60">
                  {p.vendas} × · <strong className="text-white">{brl(p.bruto)}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
          Quem entra hoje
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cartao rot="Liberados" valor={String(s.liberados)} tom="ok" />
          <Cartao rot="A vencer" valor={String(s.a_vencer)} nota="3 dias ou menos" />
          <Cartao rot="Em carência" valor={String(s.em_carencia)} nota="venceu, ainda entra" />
          <Cartao rot="Bloqueados" valor={String(s.bloqueados)} tom="alerta" />
        </div>
        <p className="mt-2 text-[11px] text-white/50">
          {s.total_com_mensalidade} pessoa(s) com mensalidade lançada
          {dados.sem_mensalidade > 0 && <> · <strong className="text-amber-300">{dados.sem_mensalidade}</strong> no leitor sem mensalidade nenhuma</>}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Movimento da catraca</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cartao rot="Entradas" valor={String(dados.frequencia.entradas)} />
          <Cartao rot="Pessoas" valor={String(dados.frequencia.pessoas)} nota="distintas" />
          <Cartao rot="Liberadas na mão" valor={String(dados.frequencia.manuais)} nota="pela recepção" />
          <Cartao rot="Barradas" valor={String(dados.negados)} />
        </div>
      </div>
    </div>
  );
}
