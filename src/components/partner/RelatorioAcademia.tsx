import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { relatorioAcademia, relatorioAcademiaExtra, relatorioTurmasEEventos, FORMAS_PAGAMENTO, type CategoriaRelatorio } from "@/lib/academia-teste.functions";
import { PessoasDoRelatorio } from "@/components/partner/PessoasDoRelatorio";

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const rotuloForma = (v: string) => FORMAS_PAGAMENTO.find((f) => f.value === v)?.label ?? v;

type Dados = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof relatorioAcademia>>>>;
type Extra = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof relatorioAcademiaExtra>>>>;
type Grade = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof relatorioTurmasEEventos>>>>;


const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Primeiro e último dia do mês corrente, em ISO. */
function mesCorrente() {
  const h = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    de: `${h.getFullYear()}-${p(h.getMonth() + 1)}-01`,
    ate: iso(h),
  };
}

/** Daqui a 30 dias — a janela padrão da projeção. */
function daquiTrintaDias() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return iso(d);
}

const diaMes = (s: string) => {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
};

function Cartao({ rot, valor, nota, tom, aoClicar }: { rot: string; valor: string; nota?: string; tom?: "ok" | "alerta"; aoClicar?: () => void }) {
  const cor = tom === "ok" ? "text-emerald-400" : tom === "alerta" ? "text-amber-300" : "text-white";
  // Numero que esconde gente vira botao: e daqui que a recepcao chega na lista.
  const Tag = (aoClicar ? "button" : "div") as "button" | "div";
  return (
    <Tag
      type={aoClicar ? "button" : undefined}
      onClick={aoClicar}
      className={`w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left ${aoClicar ? "hover:border-primary/60 hover:bg-white/10" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-wider text-white/40">{rot}</p>
      <p className={`text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
      {nota && <p className="text-[11px] text-white/50">{nota}</p>}
      {aoClicar && <p className="mt-0.5 text-[10px] font-bold text-primary">ver quem são</p>}
    </Tag>
  );
}

export function RelatorioAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(relatorioAcademia);
  const obterExtra = useServerFn(relatorioAcademiaExtra);
  const obterGrade = useServerFn(relatorioTurmasEEventos);
  const inicial = mesCorrente();
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [projecaoAte, setProjecaoAte] = useState(daquiTrintaDias());
  const [dados, setDados] = useState<Dados | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Qual numero esta aberto na lista de pessoas.
  const [aberto, setAberto] = useState<{ cat: CategoriaRelatorio; titulo: string } | null>(null);
  const abrir = (cat: CategoriaRelatorio, titulo: string) => () => setAberto({ cat, titulo });

  const carregar = (d: string, a: string, p: string) => {
    setCarregando(true);
    obter({ data: { partnerId, de: d, ate: a } })
      .then((r) => setDados(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui carregar o relatório."))
      .finally(() => setCarregando(false));
    // Separado de propósito: se o bloco novo falhar, o relatório que a recepção
    // usa todo dia continua na tela.
    obterExtra({ data: { partnerId, de: d, ate: a, projecaoAte: p } })
      .then((r) => setExtra(r))
      .catch(() => setExtra(null));
    obterGrade({ data: { partnerId, de: d, ate: a } })
      .then((r) => setGrade(r))
      .catch(() => setGrade(null));
  };

  useEffect(() => { carregar(de, ate, projecaoAte); }, [partnerId]);

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
        <button type="button" onClick={() => carregar(de, ate, projecaoAte)} disabled={carregando}
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
          <Cartao rot="Vencem em 7 dias" valor={String(dados.vencem_em_7)} nota="lista da recepção" aoClicar={abrir("vencem_em_7", "Vencem nos próximos 7 dias")} />
        </div>
        {Number(f.bruto) === 0 && (
          <p className="mt-2 text-[11px] text-white/50">
            Nenhum lançamento com valor neste período. As mensalidades importadas do sistema antigo
            entraram com valor zero — o dinheiro passa a aparecer a partir da primeira renovação feita por aqui.
          </p>
        )}
      </div>

      {/* O caixa acima olha para trás. Este bloco olha para frente: quanto a
          academia recebe se todo mundo que vence renovar o mesmo plano. O valor
          vem do PREÇO DE TABELA, não do histórico — as mensalidades importadas
          entraram com valor zero e somá-las mostraria uma academia que não
          fatura. */}
      {extra && (
        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50">O que ainda vem</h3>
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/40">projetar até</span>
              <input
                type="date"
                value={projecaoAte}
                onChange={(e) => { setProjecaoAte(e.target.value); carregar(de, ate, e.target.value); }}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cartao
              rot={`Projeção até ${diaMes(projecaoAte)}`}
              valor={brl(extra.projecaoValor)}
              tom="ok"
              nota={`${extra.projecaoPessoas} renovação(ões) prevista(s)`}
              aoClicar={abrir("projecao", `Vencem até ${diaMes(projecaoAte)}`)}
            />
            <Cartao rot="Renovações no período" valor={String(extra.renovacoesQtd)}
              nota={brl(extra.renovacoesValor) + " lançado"}
              aoClicar={abrir("renovacoes", "Renovações no período")} />
            <Cartao rot="Alunos novos" valor={String(extra.novosQtd)} nota="entraram no período"
              aoClicar={abrir("novos", "Alunos novos no período")} />
            <Cartao rot="Day-use" valor={String(extra.dayuseQtd)} nota={brl(extra.dayuseValor)}
              aoClicar={extra.dayuseQtd > 0 ? abrir("dayuse", "Day-use no período") : undefined} />
          </div>
          {extra.projecaoSemPreco > 0 && (
            <p className="mt-2 text-[11px] text-amber-300">
              {extra.projecaoSemPreco} pessoa(s) estão num plano que não existe no cadastro, então entraram
              na projeção valendo zero. Cadastre o plano — ou adicione o nome antigo como apelido dele —
              para o número ficar certo.
            </p>
          )}
        </div>
      )}

      {/* Contrato pago e ninguém viu a pessoa. É quem cancela mês que vem se
          ninguém ligar antes — o único número aqui que serve para evitar uma
          perda em vez de contar uma que já aconteceu. */}
      {extra && extra.semFrequenciaQtd > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Atenção</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cartao
              rot="Pagando e sumido"
              valor={String(extra.semFrequenciaQtd)}
              tom="alerta"
              nota="ativo, sem entrar no período"
              aoClicar={abrir("sem_frequencia", "Pagando e sem aparecer")}
            />
          </div>
        </div>
      )}

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
          <Cartao rot="Liberados" valor={String(s.liberados)} tom="ok" aoClicar={abrir("liberados", "Liberados hoje")} />
          <Cartao rot="A vencer" valor={String(s.a_vencer)} nota="3 dias ou menos" aoClicar={abrir("a_vencer", "A vencer (3 dias ou menos)")} />
          <Cartao rot="Em carência" valor={String(s.em_carencia)} nota="venceu, ainda entra" aoClicar={abrir("em_carencia", "Em carência")} />
          <Cartao rot="Bloqueados" valor={String(s.bloqueados)} tom="alerta" aoClicar={abrir("bloqueados", "Bloqueados por inadimplência")} />
        </div>
        {/* "Sem mensalidade" era só um número no rodapé. É gente que está no
            leitor e não entra em lugar nenhum da régua — justamente por isso
            some do relatório se não tiver cartão próprio. */}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cartao
            rot="Sem mensalidade"
            valor={String(dados.sem_mensalidade)}
            tom={dados.sem_mensalidade > 0 ? "alerta" : undefined}
            nota="no leitor, sem plano"
            aoClicar={abrir("sem_mensalidade", "No leitor, sem mensalidade lançada")}
          />
        </div>
        <p className="mt-2 text-[11px] text-white/50">
          {s.total_com_mensalidade} pessoa(s) com mensalidade lançada.
        </p>
      </div>

      {/* Quantas pessoas vieram em cada aula. A janela de horario da turma e o
          que classifica a passagem — nada novo e pedido a catraca, e o que ja
          foi coletado se organiza sozinho assim que a grade e cadastrada. */}
      {grade && grade.turmas.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Cliente por aula</h3>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                <tr><th className="p-2 text-left">Aula</th><th className="p-2 text-left">Horário</th>
                    <th className="p-2 text-right">Entradas</th><th className="p-2 text-right">Pessoas</th></tr>
              </thead>
              <tbody>
                {grade.turmas.map((t) => (
                  <tr key={t.turma_id ?? "fora"} className="border-t border-white/5">
                    <td className="p-2">
                      {t.turma_id ? t.turma : <span className="text-white/50">Fora de aula</span>}
                      {t.modalidade && <span className="ml-1 text-white/40">· {t.modalidade}</span>}
                    </td>
                    <td className="p-2 text-white/60">
                      {t.dias && <span className="mr-1">{t.dias}</span>}
                      {t.janela}
                    </td>
                    <td className="p-2 text-right tabular-nums">{t.entradas}</td>
                    <td className="p-2 text-right tabular-nums text-white/60">{t.pessoas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {grade.turmas.some((t) => !t.turma_id) && (
            <p className="mt-2 text-[11px] text-white/50">
              "Fora de aula" é quem passou num horário que não pertence a nenhuma turma cadastrada.
              Se esse for o maior número da tabela, a grade não descreve o que acontece na academia.
            </p>
          )}
        </div>
      )}

      {grade && grade.eventos.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Eventos no período</h3>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                <tr><th className="p-2 text-left">Evento</th><th className="p-2 text-left">Data</th>
                    <th className="p-2 text-right">Inscritos</th><th className="p-2 text-right">Foram</th>
                    <th className="p-2 text-right">Recebido</th><th className="p-2 text-right">Líquido</th></tr>
              </thead>
              <tbody>
                {grade.eventos.map((e) => (
                  <tr key={e.evento_id} className="border-t border-white/5">
                    <td className="p-2">{e.nome}</td>
                    <td className="p-2 text-white/60">{diaMes(e.data_evento)}{e.hora_inicio ? ` · ${e.hora_inicio.slice(0, 5)}` : ""}</td>
                    <td className="p-2 text-right tabular-nums">{e.inscritos}</td>
                    {/* Inscrito menos compareceu e o unico numero que diz se o evento deu certo. */}
                    <td className="p-2 text-right tabular-nums text-white/60">{e.compareceram}</td>
                    <td className="p-2 text-right tabular-nums">{brl(e.bruto)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-400">{brl(e.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Movimento da catraca</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cartao rot="Entradas" valor={String(dados.frequencia.entradas)} aoClicar={abrir("entradas", "Entradas no período")} />
          <Cartao rot="Pessoas" valor={String(dados.frequencia.pessoas)} nota="distintas" />
          <Cartao rot="Liberadas na mão" valor={String(dados.frequencia.manuais)} nota="pela recepção" aoClicar={abrir("manuais", "Liberadas na mão pela recepção")} />
          <Cartao rot="Barradas" valor={String(dados.negados)} aoClicar={abrir("barradas", "Barradas na catraca")} />
        </div>
      </div>

      {aberto && (
        <PessoasDoRelatorio
          partnerId={partnerId}
          categoria={aberto.cat}
          titulo={aberto.titulo}
          de={de}
          ate={ate}
          projecaoAte={projecaoAte}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}
