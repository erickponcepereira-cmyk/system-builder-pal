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

/**
 * O estado da academia, e só ele, tem cor própria.
 *
 * `neutro` é o padrão porque a maioria dos números só conta o que aconteceu:
 * dar cor a eles seria pedir uma ação que não existe.
 */
type TomDoCartao = "ok" | "atencao" | "critico" | "neutro";

const TARJA_POR_TOM: Record<TomDoCartao, string> = {
  ok: "bg-aca-ok",
  atencao: "bg-aca-atencao",
  critico: "bg-aca-critico",
  neutro: "bg-aca-neutro",
};

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.14em] text-aca-fraco";
const CABECALHO_TABELA = "bg-aca-alto font-mono text-[10px] uppercase tracking-[0.14em] text-aca-fraco";

/**
 * Um número do relatório.
 *
 * O estado mora na tarja de 3px da borda esquerda, nunca na cor do número:
 * aqui dentro vermelho significa uma coisa só — dá para clicar.
 */
function Cartao({ rot, valor, nota, tom = "neutro", acao = "Ver a lista", aoClicar }: {
  rot: string; valor: string; nota?: string; tom?: TomDoCartao; acao?: string; aoClicar?: () => void;
}) {
  // Moeda é string longa e não cabe no mesmo corpo de um contador de 3 dígitos.
  const ehMoeda = valor.trimStart().startsWith("R$");
  // Numero que esconde gente vira botao: e daqui que a recepcao chega na lista.
  const Tag = (aoClicar ? "button" : "div") as "button" | "div";
  return (
    <Tag
      type={aoClicar ? "button" : undefined}
      onClick={aoClicar}
      className={`relative w-full overflow-hidden rounded-xl border border-aca-line bg-aca-surface py-3 pl-4 pr-2.5 text-left md:pr-3 ${
        aoClicar
          ? "hover:border-aca-line-forte hover:bg-aca-alto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aca-acao"
          : ""
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TARJA_POR_TOM[tom]}`} />
      <span className="block text-[10px] uppercase tracking-[0.1em] text-aca-muted">{rot}</span>
      <span className={`mt-1 block font-bold leading-none tabular-nums text-aca-ink ${ehMoeda ? "text-[20px] lg:text-[23px]" : "text-[28px]"}`}>
        {valor}
      </span>
      {nota && <span className="mt-1.5 block text-[12px] leading-snug text-aca-muted">{nota}</span>}
      {aoClicar && <span className="mt-1.5 block text-[11px] font-semibold text-aca-acao">{acao} ›</span>}
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
  const [aberto, setAberto] = useState<{ cat: CategoriaRelatorio; titulo: string; filtro?: string } | null>(null);
  const abrir = (cat: CategoriaRelatorio, titulo: string, filtro?: string) => () => setAberto({ cat, titulo, filtro });

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

  if (carregando && !dados) {
    return (
      <div className="painel-academia">
        <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />
      </div>
    );
  }
  if (!dados) return null;

  const f = dados.financeiro;
  const s = dados.situacao;

  // Ordena pelo relogio. Sem isto a grade vinha 05:00, 06:00, 19:30, 17:30,
  // 18:30, 07:00 -- a ordem em que o banco devolveu.
  const turmas = grade ? [...grade.turmas].sort((a, b) => (a.comeca ?? "99:99").localeCompare(b.comeca ?? "99:99")) : [];
  // A barra de ocupação é relativa à aula mais cheia: sem um teto absoluto,
  // é a comparação entre horários que diz onde a academia enche.
  const aulaMaisCheia = Math.max(1, ...turmas.map((t) => Number(t.entradas) || 0));

  return (
    <div className="painel-academia space-y-5 text-aca-ink">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-aca-muted">De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-aca-line bg-aca-surface px-2 py-1.5 text-xs text-aca-ink" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-aca-muted">Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-aca-line bg-aca-surface px-2 py-1.5 text-xs text-aca-ink" />
        </label>
        <button type="button" onClick={() => carregar(de, ate, projecaoAte)} disabled={carregando}
          className="rounded-lg bg-aca-acao px-3 py-2 text-xs font-bold text-aca-acao-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aca-acao disabled:opacity-50">
          {carregando ? "Carregando…" : "Ver"}
        </button>
      </div>

      <div>
        <h3 className={`mb-2 ${EYEBROW}`}>Dinheiro no período</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cartao rot="Recebido" valor={brl(f.bruto)} tom="ok"
            nota={`${f.lancamentos} ${f.lancamentos === 1 ? "venda" : "vendas"} no balcão`}
            acao="Ver quem pagou"
            aoClicar={f.lancamentos > 0 ? abrir("recebido", "Quem pagou no período") : undefined} />
          <Cartao rot="Taxas" valor={brl(f.taxas)} tom="neutro"
            nota={Number(f.bruto) > 0 ? `${((Number(f.taxas) / Number(f.bruto)) * 100).toFixed(2)}% do bruto` : "maquininha"} />
          <Cartao rot="Líquido" valor={brl(f.liquido)} tom="ok" nota="o que sobra" />
          <Cartao rot="Vencem em 7 dias" valor={String(dados.vencem_em_7)} tom="atencao" nota="lista da recepção"
            acao="Ver a lista" aoClicar={abrir("vencem_em_7", "Vencem nos próximos 7 dias")} />
        </div>
        {Number(f.bruto) === 0 && (
          <p className="mt-2 text-[12px] leading-snug text-aca-muted">
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
            <h3 className={EYEBROW}>O que ainda vem</h3>
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-aca-muted">projetar até</span>
              <input
                type="date"
                value={projecaoAte}
                onChange={(e) => { setProjecaoAte(e.target.value); carregar(de, ate, e.target.value); }}
                className="rounded-lg border border-aca-line bg-aca-surface px-2 py-1 text-xs text-aca-ink"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cartao
              rot={`Projeção até ${diaMes(projecaoAte)}`}
              valor={brl(extra.projecaoValor)}
              tom="ok"
              nota={
                `${extra.projecaoPessoas} renovação(ões) prevista(s)` +
                (extra.projecaoSumidos > 0 ? ` · ${extra.projecaoSumidos} fora por sumiço` : "")
              }
              acao="Ver quem vence"
              aoClicar={abrir("projecao", `Vencem até ${diaMes(projecaoAte)}`)}
            />
            <Cartao rot="Renovações no período" valor={String(extra.renovacoesQtd)} tom="ok"
              nota={brl(extra.renovacoesValor) + " lançado"}
              acao="Ver as renovações"
              aoClicar={abrir("renovacoes", "Renovações no período")} />
            <Cartao rot="Alunos novos" valor={String(extra.novosQtd)} tom="ok" nota="entraram no período"
              acao="Ver os novos"
              aoClicar={abrir("novos", "Alunos novos no período")} />
            <Cartao rot="Day-use" valor={String(extra.dayuseQtd)} tom="neutro" nota={brl(extra.dayuseValor)}
              acao="Ver os day-use"
              aoClicar={extra.dayuseQtd > 0 ? abrir("dayuse", "Day-use no período") : undefined} />
          </div>
          {extra.projecaoSemPreco > 0 && (
            <p className="mt-2 border-l-2 border-aca-atencao pl-2 text-[12px] leading-snug text-aca-muted">
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
          <h3 className={`mb-2 ${EYEBROW}`}>Atenção</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cartao
              rot="Pagando e sumido"
              valor={String(extra.semFrequenciaQtd)}
              tom="atencao"
              nota="ativo, sem entrar no período"
              acao="Ver quem sumiu"
              aoClicar={abrir("sem_frequencia", "Pagando e sem aparecer")}
            />
          </div>
        </div>
      )}

      {dados.por_forma.length > 0 && (
        <div>
          <h3 className={`mb-2 ${EYEBROW}`}>Por forma de pagamento</h3>
          <div className="overflow-x-auto rounded-xl border border-aca-line">
            <table className="w-full text-xs">
              <thead className={CABECALHO_TABELA}>
                <tr><th className="p-2 text-left font-normal">Forma</th><th className="p-2 text-right font-normal">Recebido</th>
                    <th className="p-2 text-right font-normal">Taxa</th><th className="p-2 text-right font-normal">Líquido</th></tr>
              </thead>
              <tbody>
                {dados.por_forma.map((l) => (
                  <tr key={l.forma}
                      onClick={abrir("forma", `Pagaram com ${rotuloForma(l.forma)}`, l.forma)}
                      className="cursor-pointer border-t border-aca-line hover:bg-aca-alto">
                    <td className="p-2 font-semibold text-aca-acao">{rotuloForma(l.forma)}</td>
                    <td className="p-2 text-right tabular-nums text-aca-ink">{brl(l.bruto)}</td>
                    <td className="p-2 text-right tabular-nums text-aca-muted">{brl(l.taxas)}</td>
                    <td className="p-2 text-right tabular-nums text-aca-ink">{brl(l.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dados.por_plano.length > 0 && (
        <div>
          <h3 className={`mb-2 ${EYEBROW}`}>Por plano</h3>
          <div className="space-y-1">
            {dados.por_plano.map((p) => (
              <button key={p.plano} type="button"
                onClick={abrir("plano", `Compraram ${p.plano}`, p.plano)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-aca-line bg-aca-surface px-3 py-2 text-left text-xs hover:bg-aca-alto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aca-acao">
                <span className="min-w-0 truncate font-semibold text-aca-acao">{p.plano}</span>
                <span className="shrink-0 tabular-nums text-aca-muted">
                  {p.vendas} × · <strong className="font-bold text-aca-ink">{brl(p.bruto)}</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className={`mb-2 ${EYEBROW}`}>Quem entra hoje</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cartao rot="Liberados" valor={String(s.liberados)} tom="ok"
            acao="Ver os liberados" aoClicar={abrir("liberados", "Liberados hoje")} />
          <Cartao rot="A vencer" valor={String(s.a_vencer)} tom="atencao" nota="3 dias ou menos"
            acao="Ver quem vence" aoClicar={abrir("a_vencer", "A vencer (3 dias ou menos)")} />
          <Cartao rot="Em carência" valor={String(s.em_carencia)} tom="atencao" nota="venceu, ainda entra"
            acao="Ver os em carência" aoClicar={abrir("em_carencia", "Em carência")} />
          {/* Bloqueado há uma semana e bloqueado há um ano exigem coisas
              opostas. Somados viram um número que não pede ação nenhuma. */}
          <Cartao rot="Bloqueados" valor={String(s.bloqueados)} tom="critico" nota="dá para cobrar"
            acao="Ver quem cobrar" aoClicar={abrir("bloqueados", "Bloqueados por inadimplência")} />
        </div>
        {/* "Sem mensalidade" era só um número no rodapé. É gente que está no
            leitor e não entra em lugar nenhum da régua — justamente por isso
            some do relatório se não tiver cartão próprio. */}
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cartao
            rot="Sem mensalidade"
            valor={String(dados.sem_mensalidade)}
            tom={dados.sem_mensalidade > 0 ? "atencao" : "neutro"}
            nota="no leitor, sem plano"
            acao="Ver a lista"
            aoClicar={abrir("sem_mensalidade", "No leitor, sem mensalidade lançada")}
          />
          {s.bloqueados_antigos > 0 && (
            /* O maior número da tela, e histórico: dar vermelho a ele seria
               pedir uma ação que não existe mais. */
            <Cartao
              rot="Foram embora"
              valor={String(s.bloqueados_antigos)}
              tom="neutro"
              nota="venceu há mais de 60 dias"
              acao="Ver quem saiu"
              aoClicar={abrir("bloqueados_antigos", "Venceram há mais de 60 dias")}
            />
          )}
        </div>
        <p className="mt-2 text-[12px] text-aca-muted">
          {s.total_com_mensalidade} pessoa(s) com mensalidade lançada.
        </p>
      </div>

      {/* Quantas pessoas vieram em cada aula. A janela de horario da turma e o
          que classifica a passagem — nada novo e pedido a catraca, e o que ja
          foi coletado se organiza sozinho assim que a grade e cadastrada. */}
      {turmas.length > 0 && (
        <div>
          <h3 className={`mb-2 ${EYEBROW}`}>Cliente por aula</h3>
          <div className="overflow-x-auto rounded-xl border border-aca-line">
            <table className="w-full text-xs">
              <thead className={CABECALHO_TABELA}>
                <tr><th className="p-2 text-left font-normal">Aula</th><th className="p-2 text-left font-normal">Horário</th>
                    <th className="p-2 text-right font-normal">Entradas</th><th className="p-2 text-right font-normal">Pessoas</th></tr>
              </thead>
              <tbody>
                {turmas.map((t) => (
                  <tr key={t.turma_id ?? "fora"} className="border-t border-aca-line hover:bg-aca-alto">
                    <td className="p-2">
                      <span className="block text-aca-ink">
                        {t.turma_id ? t.turma : <span className="text-aca-muted">Fora de aula</span>}
                        {t.modalidade && <span className="ml-1 text-aca-fraco">· {t.modalidade}</span>}
                      </span>
                      <span aria-hidden className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-aca-line-forte">
                        <span
                          className={`block h-full rounded-full ${t.turma_id ? "bg-aca-ok" : "bg-aca-neutro"}`}
                          style={{ width: `${Math.round((Number(t.entradas) / aulaMaisCheia) * 100)}%` }}
                        />
                      </span>
                    </td>
                    <td className="p-2 align-top text-aca-muted">
                      {t.dias && <span className="mr-1">{t.dias}</span>}
                      {t.janela}
                    </td>
                    <td className="p-2 text-right align-top tabular-nums text-aca-ink">{t.entradas}</td>
                    <td className="p-2 text-right align-top tabular-nums text-aca-muted">{t.pessoas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {turmas.some((t) => !t.turma_id) && (
            <p className="mt-2 text-[12px] leading-snug text-aca-muted">
              "Fora de aula" é quem passou num horário que não pertence a nenhuma turma cadastrada.
              Se esse for o maior número da tabela, a grade não descreve o que acontece na academia.
            </p>
          )}
        </div>
      )}

      {grade && grade.eventos.length > 0 && (
        <div>
          <h3 className={`mb-2 ${EYEBROW}`}>Eventos no período</h3>
          <div className="overflow-x-auto rounded-xl border border-aca-line">
            <table className="w-full text-xs">
              <thead className={CABECALHO_TABELA}>
                <tr><th className="p-2 text-left font-normal">Evento</th><th className="p-2 text-left font-normal">Data</th>
                    <th className="p-2 text-right font-normal">Inscritos</th><th className="p-2 text-right font-normal">Foram</th>
                    <th className="p-2 text-right font-normal">Recebido</th><th className="p-2 text-right font-normal">Líquido</th></tr>
              </thead>
              <tbody>
                {grade.eventos.map((e) => (
                  <tr key={e.evento_id} className="border-t border-aca-line hover:bg-aca-alto">
                    <td className="p-2 text-aca-ink">{e.nome}</td>
                    <td className="p-2 text-aca-muted">{diaMes(e.data_evento)}{e.hora_inicio ? ` · ${e.hora_inicio.slice(0, 5)}` : ""}</td>
                    <td className="p-2 text-right tabular-nums text-aca-ink">{e.inscritos}</td>
                    {/* Inscrito menos compareceu e o unico numero que diz se o evento deu certo. */}
                    <td className="p-2 text-right tabular-nums text-aca-muted">{e.compareceram}</td>
                    <td className="p-2 text-right tabular-nums text-aca-ink">{brl(e.bruto)}</td>
                    <td className="p-2 text-right tabular-nums text-aca-ink">{brl(e.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className={`mb-2 ${EYEBROW}`}>Movimento da catraca</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Cartao rot="Entradas" valor={String(dados.frequencia.entradas)} tom="neutro"
            acao="Ver as entradas" aoClicar={abrir("entradas", "Entradas no período")} />
          <Cartao rot="Pessoas" valor={String(dados.frequencia.pessoas)} tom="neutro" nota="distintas" />
          <Cartao rot="Liberadas na mão" valor={String(dados.frequencia.manuais)} tom="neutro" nota="pela recepção"
            acao="Ver as liberações" aoClicar={abrir("manuais", "Liberadas na mão pela recepção")} />
          <Cartao rot="Barradas" valor={String(dados.negados)} tom="neutro"
            acao="Ver as barradas" aoClicar={abrir("barradas", "Barradas na catraca")} />
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
          filtro={aberto.filtro}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}
