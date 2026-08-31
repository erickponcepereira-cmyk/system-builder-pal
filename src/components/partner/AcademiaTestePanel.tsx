import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, Save, Dumbbell, Ban, Send, Ticket, FileText, KanbanSquare, Plug, Camera, RefreshCw, UserPlus, Plus, Trash2, ChevronUp, ChevronDown, Pencil, X } from "lucide-react";
import { RenovarAluno } from "@/components/partner/RenovarAluno";
import { CadastrarPessoaAcademia } from "@/components/partner/CadastrarPessoaAcademia";
import { RelatorioAcademia } from "@/components/partner/RelatorioAcademia";
import { InstalacaoAcademia } from "@/components/partner/InstalacaoAcademia";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { PartnerRoboPanel } from "@/components/partner/PartnerRoboPanel";
import { FunilComCampanhas } from "@/components/partner/FunilComCampanhas";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";
import { CapturaRosto } from "@/components/partner/CapturaRosto";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import {
  FORMAS_PAGAMENTO,
  buscarAlunosParaMensalidade,
  buscarPessoasAcademia,

  GATILHOS_CRM,
  MOTIVO_DAYUSE,
  MOTIVO_EVENTO,
  OPCOES_ACESSO_EVENTO,
  OPCOES_CONTA,
  OPCOES_FACE,
  OPCOES_PERIODO,
  OPCOES_VALIDACAO,
  POLITICAS_RENOVACAO,
  ROTULO_MARCO,
  TIPOS_DAYUSE,
  avaliarDayUse,
  buscarProdutosParaVincular,
  cancelarMensalidadeAcademia,
  corrigirMensalidadeAcademia,
  preverCancelamentoAcademia,
  listarPlanosParaGerir,
  salvarPlanoAcademia,
  LIMITES_SEMANA,
  DURACOES,
  listarAlunosAcademia,
  aplicarModeloTreino,
  criarEventoAcademia,
  enviarFoto,
  enviarFotoCredencial,
  gerarCodigoAgente,
  inscreverNoEvento,
  obterAgenteAcademia,
  obterConfigAcademia,
  obterCredenciaisSemVinculo,
  obterEventosAcademia,
  obterCrmAcademia,
  obterFilaDeFotos,
  obterFrequenciaAcademia,
  obterModelosAviso,
  criarMarcoAviso,
  moverMarcoAviso,
  excluirMarcoAviso,
  reordenarMarcosAviso,
  descreverMomento,
  LIMITE_DIAS_AVISO,
  obterProdutosEvento,
  obterProdutosMensalidade,
  obterTreinosAluno,
  prepararAvisosAcademia,
  obterAutomacaoAvisos,
  salvarAutomacaoAvisos,
  listarFeriados,
  salvarFeriado,
  excluirFeriado,
  previewAvisosAcademia,
  registrarDayUse,
  reprocessarMensalidadesPendentes,
  removerProdutoEvento,
  salvarProdutoEvento,
  salvarProdutoMensalidade,
  salvarConfigAcademia,
  salvarConfigFrequencia,
  salvarModelosAviso,
  salvarRegraCrm,
  salvarTurma,
  sincronizarCrmAcademia,
  validarCredencialEvento,
  vincularCredencial,
  type FormaPagamento,
  type ModeloAviso,
  type ReferenciaAviso,
  type PessoaAcademia,
} from "@/lib/academia-teste.functions";
import { formatDateOnlyBR } from "@/lib/date-only";
import { FluxoCaixa } from "@/components/partner/FluxoCaixa";
import {
  BOTAO_ACAO, BOTAO_ICONE, BOTAO_NEUTRO, BOTAO_TEXTO, CAMPO, CAMPO_MINI,
  Bloco, Campo, Cartao, Etiqueta, EYEBROW, FOCO, LinhaDado, NOTA, Pilula, ROTULO,
  Selo, escolha, type Tom,
} from "@/components/partner/VisualAcademia";


type SubAba = "relatorio" | "caixa" | "alunos" | "mensalidade" | "produtos" | "frequencia" | "avisos" | "crm" | "robo" | "funis" | "dayuse" | "eventos" | "agente" | "instalacao" | "config";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Quantas credenciais sem vínculo a tela desenha de uma vez. Com 400 pessoas no
// leitor, desenhar todas empurra o resto da aba para fora da tela — e ninguém
// liga 400 vínculos rolando uma lista.
const LIMITE_PENDENTES = 20;

// Chaveado pelos motivos que a função acesso_classificar devolve, para a tela
// não manter uma segunda versão da régua.
//
// O tom deixou de ser classe de cor e virou significado: quem decide onde ele
// aparece é o cartão, na tarja da borda esquerda. "Sem mensalidade" é neutro
// porque não é castigo nem urgência — é ausência de lançamento.
const ESTADOS: Record<string, { label: string; tom: Tom }> = {
  contrato_ativo: { label: "Ativo", tom: "ok" },
  vencimento_proximo: { label: "Vence em breve", tom: "atencao" },
  em_carencia: { label: "Em carência", tom: "atencao" },
  vencido_bloqueado: { label: "Bloqueado", tom: "critico" },
  sem_mensalidade: { label: "Sem mensalidade", tom: "neutro" },
};

export function AcademiaTestePanel({ partnerId }: { partnerId: string }) {
  const [sub, setSub] = useState<SubAba>("alunos");

  // Sem TestSurfaceGate: o painel saiu da fase de teste. Quem pode ver é quem
  // é dono ou membro da unidade — o mesmo critério que `autorizar` aplica no
  // servidor. Manter o gate de master admin aqui esconderia a academia
  // justamente de quem trabalha nela.
  return (
    <>
      {/* `painel-academia` mora aqui, no container raiz: é ele que define os
          tokens `aca-*`, e é assim que as 14 abas herdam a paleta sem cada uma
          se embrulhar por conta própria. */}
      <div className="painel-academia space-y-4 text-aca-ink">
        <Bloco>
          <p className="flex items-center gap-2 text-sm font-bold text-aca-ink">
            <Dumbbell className="h-4 w-4 text-aca-muted" /> Gestão da academia
          </p>
          <p className={`mt-1 ${NOTA}`}>
            Catraca, alunos, mensalidade e avisos. A academia só monitora a frequência; o aluno continua do coach responsável.
          </p>
        </Bloco>

        {/* Rola no celular, quebra em linhas no computador: com 14 abas,
            rolar lateralmente para achar "Configurações" e trabalho a toa. */}
        <div className="flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible">
          {([
            ["relatorio", "Relatório"],
            ["caixa", "Fluxo de caixa"],
            ["alunos", "Alunos da academia"],
            ["mensalidade", "Registrar / renovar"],
            ["frequencia", "Frequência"],
            ["avisos", "Avisos de vencimento"],
            ["crm", "CRM"],
            ["robo", "Robô"],
            ["funis", "Funis de envio"],
            ["produtos", "Produtos que liberam"],
            ["dayuse", "Day-use"],
            ["eventos", "Eventos"],
            ["agente", "Agente da catraca"],
            ["instalacao", "Instalação"],
            ["config", "Configurações"],
          ] as [SubAba, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-current={sub === k ? "page" : undefined}
              onClick={() => setSub(k)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] transition ${escolha(sub === k)}`}
            >
              {label}
            </button>
          ))}
        </div>

        {sub === "relatorio" && <RelatorioAcademia partnerId={partnerId} />}
        {sub === "caixa" && <FluxoCaixa partnerId={partnerId} />}
        {sub === "alunos" && <ListaAlunos partnerId={partnerId} />}
        {sub === "mensalidade" && <FormMensalidade partnerId={partnerId} />}
        {sub === "avisos" && <AvisosVencimento partnerId={partnerId} />}
        {sub === "frequencia" && <Frequencia partnerId={partnerId} />}
        {sub === "crm" && <CrmAcademia partnerId={partnerId} />}
        {sub === "robo" && <PartnerRoboPanel partnerId={partnerId} />}
        {sub === "funis" && <FunilComCampanhas partnerId={partnerId} />}
        {sub === "dayuse" && <DayUse partnerId={partnerId} />}
        {sub === "produtos" && (
          <div className="space-y-4">
            <PlanosAcademia partnerId={partnerId} />
            <ProdutosMensalidade partnerId={partnerId} />
            <ProdutosEvento partnerId={partnerId} />
          </div>
        )}
        {sub === "eventos" && <Eventos partnerId={partnerId} />}
        {sub === "agente" && <AgenteAcademia partnerId={partnerId} />}
        {sub === "instalacao" && <InstalacaoAcademia partnerId={partnerId} />}
        {sub === "config" && <ConfigAcademia partnerId={partnerId} />}
      </div>
    </>
  );
}

function DayUse({ partnerId }: { partnerId: string }) {
  const avaliar = useServerFn(avaliarDayUse);
  const registrar = useServerFn(registrarDayUse);
  const [cpf, setCpf] = useState("");
  const [checando, setChecando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [veredito, setVeredito] = useState<{
    decisao: string; motivo: string; usos: number; ultimo_uso: string | null;
  } | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipo, setTipo] = useState<string>("day_use");
  const [valor, setValor] = useState(0);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");

  const digitos = cpf.replace(/\D/g, "");

  const checar = async () => {
    setChecando(true);
    setVeredito(null);
    try {
      const r = await avaliar({ data: { partnerId, cpf } });
      setVeredito(r as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao consultar.");
    } finally {
      setChecando(false);
    }
  };

  const gravar = async () => {
    setSalvando(true);
    try {
      await registrar({
        data: {
          partnerId, cpf, nome, telefone: telefone || undefined, tipo,
          valor, formaPagamento: valor > 0 ? forma : undefined,
        },
      });
      toast.success("Entrada liberada e registrada.");
      setCpf(""); setNome(""); setTelefone(""); setValor(0); setVeredito(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  };

  const liberado = veredito?.decisao === "liberado";

  return (
    <div className="space-y-3">
      <Bloco>
        <p className={NOTA}>
          Caminho separado da mensalidade. A regra de quantas vezes cada CPF pode
          entrar é a que estiver em Configurações.
        </p>
        <p className={`mt-1.5 ${NOTA}`}>
          O CPF é guardado como código embaralhado, não como número — só os 3
          últimos dígitos ficam visíveis para a recepção conferir com o documento.
        </p>
      </Bloco>

      <div className="flex gap-2">
        <input
          value={cpf}
          onChange={(e) => { setCpf(e.target.value); setVeredito(null); }}
          placeholder="CPF de quem vai entrar"
          inputMode="numeric"
          className={`min-w-0 flex-1 ${CAMPO}`}
        />
        <button
          type="button"
          onClick={() => void checar()}
          disabled={checando || digitos.length !== 11}
          className={`shrink-0 ${BOTAO_NEUTRO}`}
        >
          {checando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </button>
      </div>

      {/* O veredito é estado, então vem na tarja — e não na cor do texto, que
          diria "clique aqui" para uma frase que não é clicável. */}
      {veredito && (
        <Bloco tom={liberado ? "ok" : "critico"}>
          <p className="text-sm font-bold text-aca-ink">
            {MOTIVO_DAYUSE[veredito.motivo] ?? veredito.motivo}
          </p>
          {veredito.usos > 0 && (
            <p className={`mt-0.5 ${NOTA}`}>
              {veredito.usos} uso(s) registrado(s)
              {veredito.ultimo_uso && ` · último em ${new Date(`${veredito.ultimo_uso}T12:00:00`).toLocaleDateString("pt-BR")}`}
            </p>
          )}
        </Bloco>
      )}

      {liberado && (
        <Bloco className="space-y-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            className={`w-full ${CAMPO}`}
          />
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
            inputMode="tel"
            className={`w-full ${CAMPO}`}
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={`w-full ${CAMPO}`}
          >
            {TIPOS_DAYUSE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <CurrencyInputBRL value={valor} onChange={setValor} className={`w-full ${CAMPO}`} />
            </div>
            {valor > 0 && (
              <select
                value={forma}
                onChange={(e) => setForma(e.target.value as FormaPagamento)}
                className={`shrink-0 ${CAMPO}`}
              >
                {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            )}
          </div>
          <p className={NOTA}>
            Deixe o valor em zero para entrada gratuita.
          </p>

          <button
            type="button"
            onClick={() => void gravar()}
            disabled={salvando || nome.trim().length < 3}
            className={`w-full ${BOTAO_ACAO}`}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
            Liberar e registrar
          </button>
        </Bloco>
      )}
    </div>
  );
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/** Rotulo curto para os botoes de dia da turma. EXTRACT(DOW): 0 = domingo. */
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * "seg–sex" em vez de "1, 2, 3, 4, 5". Mesma regra do `dias_semana_rotulo` do
 * banco: sequencia corrida vira intervalo, salteada fica em lista.
 */
function rotuloDias(dias: number[] | null | undefined) {
  const d = Array.from(new Set(dias ?? [])).sort((a, b) => a - b);
  if (!d.length || d.length === 7) return "todo dia";
  if (d.length === 1) return DIAS_CURTOS[d[0]];
  const corrido = d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  return corrido
    ? `${DIAS_CURTOS[d[0]]}–${DIAS_CURTOS[d[d.length - 1]]}`
    : d.map((n) => DIAS_CURTOS[n]).join(", ");
}

function Eventos({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterEventosAcademia);
  const criar = useServerFn(criarEventoAcademia);
  const inscrever = useServerFn(inscreverNoEvento);
  const validar = useServerFn(validarCredencialEvento);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [nome, setNome] = useState("");
  const [dataEv, setDataEv] = useState("");
  const [valorEv, setValorEv] = useState(0);
  const [acesso, setAcesso] = useState("qrcode");
  const [facePol, setFacePol] = useState("uma_leitura");
  const [inscEvento, setInscEvento] = useState("");
  const [inscNome, setInscNome] = useState("");
  const [inscCpf, setInscCpf] = useState("");
  const [credencial, setCredencial] = useState("");
  const [veredito, setVeredito] = useState<{ decisao: string; motivo: string; nome: string | null } | null>(null);

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [partnerId]);

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;

  return (
    <div className="space-y-3">
      {dados.facesPendentes.length > 0 && (
        <Bloco tom="critico">
          <p className="text-[12px] font-bold text-aca-ink">
            {dados.facesPendentes.length} rosto(s) para apagar do leitor
          </p>
          <p className={`mt-0.5 ${NOTA}`}>
            O prazo venceu. Enquanto o agente da academia não existir, isso é
            tarefa manual — apagar no próprio iDFace.
          </p>
          <div className="mt-1.5 space-y-0.5">
            {dados.facesPendentes.slice(0, 6).map((f) => (
              <p key={f.inscricao_id} className="text-[12px] text-aca-muted">
                <strong className="font-semibold text-aca-ink">{f.nome}</strong> — {f.evento}
              </p>
            ))}
          </div>
        </Bloco>
      )}

      <Bloco className="space-y-2">
        <p className={EYEBROW}>Novo evento</p>
        <input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Aulão de funcional)"
          className={`w-full ${CAMPO}`}
        />
        <div className="flex gap-2">
          <input
            type="date" value={dataEv} onChange={(e) => setDataEv(e.target.value)}
            className={`min-w-0 flex-1 ${CAMPO}`}
          />
          <div className="min-w-0 flex-1"><CurrencyInputBRL value={valorEv} onChange={setValorEv} className={`w-full ${CAMPO}`} /></div>
        </div>
        <select
          value={acesso} onChange={(e) => setAcesso(e.target.value)}
          className={`w-full ${CAMPO}`}
        >
          {OPCOES_ACESSO_EVENTO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {acesso !== "qrcode" && (
          <>
            <select
              value={facePol} onChange={(e) => setFacePol(e.target.value)}
              className={`w-full ${CAMPO}`}
            >
              {OPCOES_FACE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {/* Aviso de responsabilidade, não botão: a barra à esquerda marca o
                peso sem prometer clique. */}
            <p className={`border-l-2 border-aca-atencao pl-2 ${NOTA}`}>
              Rosto de quem não é aluno é dado sensível. O prazo de exclusão nasce
              junto com o cadastro e a academia é responsável por cumpri-lo.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await criar({ data: { partnerId, nome, data: dataEv, valor: valorEv, acesso, facePolitica: facePol } });
              setNome(""); setDataEv(""); setValorEv(0); carregar();
              toast.success("Evento criado.");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
          }}
          disabled={nome.trim().length < 3 || !dataEv}
          className={`w-full ${BOTAO_NEUTRO}`}
        >
          Criar evento
        </button>
      </Bloco>

      {dados.eventos.length > 0 && (
        <>
          <Bloco className="space-y-2">
            <p className={EYEBROW}>Inscrever participante</p>
            <select
              value={inscEvento} onChange={(e) => setInscEvento(e.target.value)}
              className={`w-full ${CAMPO}`}
            >
              <option value="">Escolha o evento…</option>
              {dados.eventos.filter((e) => e.ativo).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} — {new Date(`${e.data_evento}T12:00:00`).toLocaleDateString("pt-BR")}
                </option>
              ))}
            </select>
            <input
              value={inscNome} onChange={(e) => setInscNome(e.target.value)}
              placeholder="Nome do participante"
              className={`w-full ${CAMPO}`}
            />
            <input
              value={inscCpf} onChange={(e) => setInscCpf(e.target.value)}
              placeholder="CPF (opcional)" inputMode="numeric"
              className={`w-full ${CAMPO}`}
            />
            <button
              type="button"
              onClick={async () => {
                const ev = dados.eventos.find((e) => e.id === inscEvento);
                try {
                  const r = await inscrever({
                    data: {
                      partnerId, eventoId: inscEvento, nome: inscNome, cpf: inscCpf,
                      valor: ev?.valor ?? 0, formaPagamento: (ev?.valor ?? 0) > 0 ? "dinheiro" : undefined,
                    },
                  });
                  setInscNome(""); setInscCpf(""); carregar();
                  toast.success(`Credencial: ${r.credencial.slice(0, 8)}…`);
                } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
              }}
              disabled={!inscEvento || inscNome.trim().length < 3}
              className={`w-full ${BOTAO_ACAO}`}
            >
              Inscrever
            </button>
          </Bloco>

          <Bloco className="space-y-2">
            <p className={EYEBROW}>Validar entrada</p>
            <div className="flex gap-2">
              <input
                value={credencial} onChange={(e) => { setCredencial(e.target.value); setVeredito(null); }}
                placeholder="Credencial do participante"
                className={`min-w-0 flex-1 ${CAMPO}`}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await validar({ data: { partnerId, credencial } });
                    setVeredito(r as never); carregar();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
                }}
                disabled={credencial.trim().length < 6}
                className={`shrink-0 ${BOTAO_NEUTRO}`}
              >
                Validar
              </button>
            </div>
            {veredito && (
              <Bloco tom={veredito.decisao === "liberado" ? "ok" : "critico"}>
                <p className="text-sm font-bold text-aca-ink">
                  {MOTIVO_EVENTO[veredito.motivo] ?? veredito.motivo}
                </p>
                {veredito.nome && <p className={`mt-0.5 ${NOTA}`}>{veredito.nome}</p>}
              </Bloco>
            )}
          </Bloco>

          <div className="space-y-2">
            {dados.eventos.map((e) => {
              const insc = dados.inscricoes.filter((i) => i.evento_id === e.id);
              const usados = insc.filter((i) => i.usado_em).length;
              return (
                /* Evento passado e evento por vir pedem coisas opostas, e a tela
                   não sabe qual é qual sem consultar a data — cinza para os dois
                   é mais honesto que inventar uma urgência. */
                <Bloco key={e.id} tom="neutro">
                  <p className="font-semibold text-aca-ink">{e.nome}</p>
                  <p className={`mt-0.5 tabular-nums ${NOTA}`}>
                    {new Date(`${e.data_evento}T12:00:00`).toLocaleDateString("pt-BR")}
                    {e.valor > 0 && ` · ${brl(Number(e.valor))}`}
                    {" · "}{insc.length} inscrito(s), {usados} entrou(entraram)
                  </p>
                </Bloco>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Frequencia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterFrequenciaAcademia);
  const salvarCfg = useServerFn(salvarConfigFrequencia);
  const criarTurma = useServerFn(salvarTurma);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [turmaId, setTurmaId] = useState("");
  const [desde, setDesde] = useState("");
  const [novaTurma, setNovaTurma] = useState("");
  // "" = todo dia. Os números seguem EXTRACT(DOW) do Postgres: 0 = domingo.
  // Vazio = todo dia, igual ao banco (cardinality 0).
  const [diasTurma, setDiasTurma] = useState<number[]>([]);
  const [inicioTurma, setInicioTurma] = useState("");
  const [fimTurma, setFimTurma] = useState("");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId, desde: desde || null, turmaId: turmaId || null } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [partnerId, desde, turmaId]);

  const gravarCfg = async (patch: Partial<{ validacao: string; conta: string; periodo: string; meta: number | null }>) => {
    if (!dados) return;
    const c = dados.config;
    setSalvando(true);
    try {
      await salvarCfg({
        data: {
          partnerId,
          validacao: patch.validacao ?? c.validacao_frequencia,
          conta: patch.conta ?? c.frequencia_conta,
          periodo: patch.periodo ?? c.frequencia_periodo,
          meta: patch.meta !== undefined ? patch.meta : c.frequencia_meta,
        },
      });
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  /*
   * Só a PRIMEIRA carga desmonta a aba.
   *
   * Era `if (loading || !dados)`. Como `carregar()` roda a cada mudança de
   * `desde`, e ele liga `loading`, a aba inteira virava um spinner a cada
   * tecla digitada no campo de data — o <input> era destruído e recriado, o
   * foco ia embora e o buffer do ano zerava. Para quem estava usando, era
   * indistinguível de a página recarregar sozinha.
   *
   * Agora o formulário fica de pé e o spinner vive só na área do resultado.
   */
  if (!dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;
  const c = dados.config;

  return (
    <div className="space-y-3">
      <Bloco className="space-y-2">
        <p className={EYEBROW}>Como esta academia conta</p>

        <select
          value={c.validacao_frequencia}
          onChange={(e) => void gravarCfg({ validacao: e.target.value })}
          disabled={salvando}
          className={`w-full ${CAMPO}`}
        >
          {OPCOES_VALIDACAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={c.frequencia_conta}
          onChange={(e) => void gravarCfg({ conta: e.target.value })}
          disabled={salvando}
          className={`w-full ${CAMPO}`}
        >
          {OPCOES_CONTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={c.frequencia_periodo}
          onChange={(e) => void gravarCfg({ periodo: e.target.value })}
          disabled={salvando}
          className={`w-full ${CAMPO}`}
        >
          {OPCOES_PERIODO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <input
          type="number"
          min={0}
          value={c.frequencia_meta ?? ""}
          onChange={(e) => void gravarCfg({ meta: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="Meta de aulas para premiação (ex.: 100)"
          className={`w-full ${CAMPO}`}
        />
        <p className={NOTA}>
          Toda entrada é sempre registrada, inclusive a segunda do mesmo dia. A
          configuração decide o que <strong className="font-semibold text-aca-ink">conta</strong>, não o que é guardado.
        </p>
      </Bloco>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={ROTULO}>Turma</span>
          <select
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
            className={`min-w-0 ${CAMPO}`}
          >
            <option value="">Todas as turmas</option>
            {dados.turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        {/* O campo não tinha rótulo nenhum, e ninguém sabia se era início, fim
            ou data da aula. No servidor ele vira `entrada_em >= p_desde`: é o
            começo da contagem, e não existe data final. */}
        <label className="flex shrink-0 flex-col gap-1">
          <span className={ROTULO}>Contar a partir de</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={CAMPO}
          />
        </label>
        {desde && (
          <button
            type="button"
            onClick={() => setDesde("")}
            className={`self-end ${BOTAO_TEXTO}`}
          >
            limpar
          </button>
        )}
      </div>
      <p className={NOTA}>
        Em branco, conta desde sempre. Com data, conta só as entradas daquele dia em diante.
      </p>

      {/* Dia e horário deixaram de ser opcionais na prática.
          É a janela de horário que faz o relatório "Cliente por aula" existir:
          a catraca não sabe qual aula está rolando, então a passagem é
          classificada pelo relógio. Turma sem horário não aparece lá — some do
          relatório sem dizer por quê. */}
      <div className="flex flex-wrap gap-2">
        <input
          value={novaTurma}
          onChange={(e) => setNovaTurma(e.target.value)}
          placeholder="Nova turma (ex.: Bike Indoor 19h)"
          className={`min-w-[180px] flex-1 ${CAMPO}`}
        />
        {/* Dias como botões, não como <select> de um item só: a mesma aula
            acontece de segunda a sexta, e no modelo antigo isso viraria cinco
            turmas iguais. Nenhum marcado = todo dia. */}
        <div className="flex shrink-0 gap-1">
          {DIAS_CURTOS.map((d, i) => {
            const on = diasTurma.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDiasTurma((v) => (on ? v.filter((x) => x !== i) : [...v, i].sort()))}
                className={`w-9 rounded-lg py-2 text-[11px] capitalize transition ${escolha(on)}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <input type="time" value={inicioTurma} onChange={(e) => setInicioTurma(e.target.value)}
          className={`shrink-0 ${CAMPO}`} />
        <input type="time" value={fimTurma} onChange={(e) => setFimTurma(e.target.value)}
          className={`shrink-0 ${CAMPO}`} />
        <button
          type="button"
          onClick={async () => {
            /*
             * A turma SEMPRE foi criada — o que faltava era dizer isso.
             *
             * O clique gravava, limpava o campo e recarregava. Sem toast e sem
             * lista visível, o único efeito na tela era o texto sumir, o que se
             * lê como "não criou nada". E como não há unique em (partner, nome),
             * clicar de novo criava uma segunda turma igual.
             */
            const nome = novaTurma.trim();
            // Janela pela metade não classifica nada: a consulta exige as duas
            // pontas. Melhor barrar aqui do que criar uma turma que nunca vai
            // aparecer no relatório de aulas.
            if ((inicioTurma && !fimTurma) || (!inicioTurma && fimTurma)) {
              toast.error("Informe o horário de início E de fim, ou deixe os dois em branco.");
              return;
            }
            if (inicioTurma && fimTurma && fimTurma <= inicioTurma) {
              toast.error("O fim precisa ser depois do início.");
              return;
            }
            setSalvando(true);
            try {
              await criarTurma({ data: {
                partnerId, nome,
                diasSemana: diasTurma,
                horaInicio: inicioTurma || null,
                horaFim: fimTurma || null,
              } });
              setNovaTurma(""); setDiasTurma([]); setInicioTurma(""); setFimTurma("");
              toast.success(
                inicioTurma
                  ? `Turma "${nome}" criada. Ela já aparece em "Cliente por aula" no relatório.`
                  : `Turma "${nome}" criada — sem horário, ela não entra em "Cliente por aula".`,
              );
              carregar();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível criar a turma.");
            } finally {
              setSalvando(false);
            }
          }}
          disabled={salvando || novaTurma.trim().length < 2}
          className={`shrink-0 ${BOTAO_NEUTRO}`}
        >
          {salvando ? "Criando…" : "Criar"}
        </button>
      </div>

      {/* As turmas só existiam como <option> dentro do seletor acima, cujo
          rótulo continua "Todas as turmas". Criar uma não mudava um pixel da
          tela. Aqui elas ficam visíveis. */}
      {dados.turmas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dados.turmas.map((t) => (
            <Etiqueta key={t.id}>
              <span className="text-aca-ink">{t.nome}</span>
              {t.hora_inicio && (
                <span className="tabular-nums text-aca-fraco">
                  {rotuloDias(t.dias_semana)} {t.hora_inicio.slice(0, 5)}–{(t.hora_fim ?? "").slice(0, 5)}
                </span>
              )}
              {/* Sem horário a turma não entra em "Cliente por aula". Dizer
                  isso aqui é mais barato que a academia descobrir olhando um
                  relatório vazio. */}
              {!t.hora_inicio && (
                <span className="flex items-center gap-1 text-aca-fraco">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-aca-atencao" /> sem horário
                </span>
              )}
            </Etiqueta>
          ))}
        </div>
      )}

      {loading ? (
        <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-aca-acao" />
      ) : dados.linhas.length === 0 ? (
        <p className={`py-8 text-center ${NOTA}`}>
          Nenhuma frequência registrada ainda. Ela aparece quando a catraca ou o
          QR começarem a registrar entrada.
        </p>
      ) : (
        <div className="space-y-2">
          {dados.linhas.map((l) => {
            const contagem = c.frequencia_conta === "dia" ? l.dias : l.visitas;
            const meta = c.frequencia_meta ?? 0;
            const bateu = meta > 0 && contagem >= meta;
            return (
              /* Bater a meta é a única coisa aqui que muda de estado. Sem meta
                 cadastrada a linha é histórico puro, e histórico é neutro. */
              <Bloco key={l.student_id} tom={meta > 0 && bateu ? "ok" : "neutro"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-aca-ink">{l.nome}</p>
                    <p className={`mt-0.5 tabular-nums ${NOTA}`}>
                      {contagem} {c.frequencia_conta === "dia" ? "dia(s)" : "entrada(s)"}
                      {l.minutos_medios > 0 && ` · ${l.minutos_medios} min em média`}
                      {l.ultima && ` · última em ${new Date(l.ultima).toLocaleDateString("pt-BR")}`}
                    </p>
                    {l.repetiu_hoje && (
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-aca-muted">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-aca-atencao" />
                        Entrou mais de uma vez hoje
                      </p>
                    )}
                  </div>
                  {meta > 0 && <Selo>{contagem}/{meta}</Selo>}
                </div>
              </Bloco>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TreinosAluno({ partnerId, studentId, nomeAluno, onClose }: {
  partnerId: string; studentId: string; nomeAluno: string; onClose: () => void;
}) {
  const obter = useServerFn(obterTreinosAluno);
  const aplicar = useServerFn(aplicarModeloTreino);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [planos, setPlanos] = useState<Array<{
    plano_id: string; nome: string; dia_semana: number | null; ativo: boolean;
    exercicios: number; montado_por_nome: string; coach_do_aluno: string;
  }>>([]);
  const [modelos, setModelos] = useState<Array<{ id: string; name: string; level: string | null }>>([]);
  const [modeloId, setModeloId] = useState("");
  const [dia, setDia] = useState<string>("");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId, studentId } })
      .then((r) => { setPlanos(r.planos as never); setModelos(r.modelos as never); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [partnerId, studentId]);

  const criar = async () => {
    if (!modeloId) return;
    setSalvando(true);
    try {
      await aplicar({
        data: {
          partnerId, studentId, templateId: modeloId,
          diaSemana: dia === "" ? null : Number(dia),
        },
      });
      toast.success("Treino criado para o aluno.");
      setModeloId(""); setDia("");
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar.");
    } finally {
      setSalvando(false);
    }
  };

  const coach = planos[0]?.coach_do_aluno;

  return (
    <div
      className="painel-academia fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Treinos de ${nomeAluno}`}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-aca-line bg-aca-ground p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-aca-ink">Treinos de {nomeAluno}</p>
            {coach && (
              <p className={`mt-0.5 ${NOTA}`}>
                Aluno de <strong className="font-semibold text-aca-ink">{coach}</strong> — o vínculo e a comissão não mudam.
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className={BOTAO_ICONE}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-aca-acao" />
        ) : (
          <div className="space-y-3">
            <Bloco className="space-y-2">
              <p className={EYEBROW}>Aplicar um treino pronto</p>
              <select
                value={modeloId}
                onChange={(e) => setModeloId(e.target.value)}
                className={`w-full ${CAMPO}`}
              >
                <option value="">Escolha um modelo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.level ? ` · ${m.level}` : ""}</option>
                ))}
              </select>
              <select
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className={`w-full ${CAMPO}`}
              >
                <option value="">Sem dia fixo</option>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <button
                type="button"
                onClick={() => void criar()}
                disabled={salvando || !modeloId}
                className={`w-full ${BOTAO_ACAO}`}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dumbbell className="h-4 w-4" />}
                Criar treino
              </button>
              {modelos.length === 0 && (
                <p className={NOTA}>
                  Nenhum modelo global cadastrado ainda. Os modelos vêm da biblioteca de treinos prontos.
                </p>
              )}
            </Bloco>

            {planos.length === 0 ? (
              <p className={`py-6 text-center ${NOTA}`}>Este aluno ainda não tem treino.</p>
            ) : (
              <div className="space-y-2">
                {planos.map((p) => (
                  <Bloco key={p.plano_id} tom={p.ativo ? "ok" : "neutro"}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-aca-ink">{p.nome}</p>
                        <p className={`mt-0.5 ${NOTA}`}>
                          {p.exercicios} exercício(s)
                          {p.dia_semana != null && ` · ${DIAS[p.dia_semana]}`}
                        </p>
                        <p className={NOTA}>
                          Montado por <strong className="font-semibold text-aca-ink">{p.montado_por_nome}</strong>
                        </p>
                      </div>
                      {!p.ativo && <Selo>Inativo</Selo>}
                    </div>
                  </Bloco>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cadastro de rosto sem estar na academia: escolhe o aluno, tira ou envia a
 * foto, e o agente grava no leitor na próxima sincronização.
 */
function CadastrarRostoPelaFoto({ partnerId }: { partnerId: string }) {
  const buscar = useServerFn(buscarAlunosParaMensalidade);
  const enviar = useServerFn(enviarFoto);
  const obterFila = useServerFn(obterFilaDeFotos);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Array<{ studentId: string; nome: string }>>([]);
  const [alvo, setAlvo] = useState<{ studentId: string; nome: string } | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fila, setFila] = useState<Array<{
    id: string; nome: string; referencia: string; status: string; erro: string | null;
  }>>([]);

  const carregarFila = () => {
    obterFila({ data: { partnerId } })
      .then((r) => setFila(r.fila as never))
      .catch(() => setFila([]));
  };
  useEffect(carregarFila, [partnerId]);

  useEffect(() => {
    if (termo.trim().length < 3) { setAchados([]); return; }
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } }).then((r) => setAchados(r.alunos)).catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, partnerId]);

  const pegarArquivo = async (f: File) => {
    if (f.size > 4 * 1024 * 1024) { toast.error("Foto muito grande. Use uma menor que 4 MB."); return; }
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Não consegui ler o arquivo"));
      r.readAsDataURL(f);
    });
    setFoto(b64);
  };

  const mandar = async () => {
    if (!alvo || !foto) return;
    setEnviando(true);
    try {
      const r = await enviar({ data: { partnerId, studentId: alvo.studentId, nome: alvo.nome, fotoBase64: foto } });
      toast.success(`Foto na fila. Vai virar o id ${r.referencia} no leitor.`);
      setAlvo(null); setFoto(null); setTermo("");
      carregarFila();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally { setEnviando(false); }
  };

  const pendentes = fila.filter((f) => f.status === "pendente").length;
  const comErro = fila.filter((f) => f.status === "erro");

  return (
    <Bloco className="space-y-2">
      <p className={EYEBROW}>Cadastrar rosto pela foto</p>
      <p className={NOTA}>
        Escolha o aluno e envie a foto. O agente grava no leitor na próxima
        sincronização — <strong className="font-semibold text-aca-ink">sem precisar estar na academia</strong>.
      </p>

      {alvo ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-aca-alto px-2.5 py-1.5">
            <span className="truncate text-sm text-aca-ink">{alvo.nome}</span>
            <button
              type="button"
              onClick={() => { setAlvo(null); setFoto(null); }}
              aria-label="Escolher outro aluno"
              className={BOTAO_ICONE}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCapturando(true)}
              className={`flex-1 ${BOTAO_NEUTRO}`}
            >
              <Camera className="h-4 w-4" />
              {foto ? "Tirar outra" : "Tirar foto agora"}
            </button>
            <label className={`cursor-pointer ${BOTAO_NEUTRO}`}>
              Escolher arquivo
              <input
                type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pegarArquivo(f); }}
              />
            </label>
          </div>

          {foto && (
            <img src={foto} alt="" className="mx-auto max-h-40 rounded-lg border border-aca-line" />
          )}

          {capturando && (
            <CapturaRosto
              onPronta={(b64) => { setFoto(b64); setCapturando(false); }}
              onCancelar={() => setCapturando(false)}
            />
          )}

          <p className={NOTA}>
            "Tirar foto agora" confere nitidez, luz e enquadramento antes de
            aceitar — evita descobrir que a foto era ruim só na sincronização.
          </p>

          <button
            type="button"
            onClick={() => void mandar()}
            disabled={enviando || !foto}
            className={`w-full ${BOTAO_ACAO}`}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Enviar para o leitor
          </button>
        </>
      ) : (
        <>
          <input
            value={termo} onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar aluno pelo nome, CPF ou e-mail"
            className={`w-full ${CAMPO}`}
          />
          {achados.map((a) => (
            <button
              key={a.studentId} type="button" onClick={() => setAlvo(a)}
              className={`w-full truncate rounded-lg bg-aca-alto px-2.5 py-1.5 text-left text-sm text-aca-ink hover:bg-aca-line ${FOCO}`}
            >
              {a.nome}
            </button>
          ))}
        </>
      )}

      {pendentes > 0 && (
        <p className={`border-l-2 border-aca-atencao pl-2 ${NOTA}`}>
          {pendentes} foto(s) esperando a próxima sincronização do agente.
        </p>
      )}
      {comErro.map((f) => (
        <p key={f.id} className={`border-l-2 border-aca-critico pl-2 ${NOTA}`}>
          {f.nome}: {f.erro}
        </p>
      ))}
    </Bloco>
  );
}

function RostoDepoisDoCadastro({
  partnerId, pessoa, aoFinalizar,
}: {
  partnerId: string;
  pessoa: { credencialId: string; nome: string; referencia: string };
  aoFinalizar: () => void;
}) {
  const enviar = useServerFn(enviarFotoCredencial);
  const [capturando, setCapturando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviarCaptura = async (fotoBase64: string) => {
    setCapturando(false);
    setEnviando(true);
    try {
      const resultado = await enviar({
        data: { partnerId, credencialId: pessoa.credencialId, fotoBase64 },
      });
      toast.success(`Rosto enviado para a catraca no identificador ${resultado.referencia ?? pessoa.referencia}.`);
      aoFinalizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o rosto.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    /* Verde: a mensalidade entrou. O que falta é opcional, e um tom de alarme
       aqui faria a recepção achar que o lançamento não pegou. */
    <Bloco tom="ok" className="space-y-3">
      <div>
        <p className="text-sm font-bold text-aca-ink">Mensalidade registrada</p>
        <p className={`mt-1 ${NOTA}`}>
          {pessoa.nome} já será sincronizada com a catraca pelo identificador{" "}
          <span className="font-mono tabular-nums text-aca-ink">{pessoa.referencia}</span>.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => setCapturando(true)}
          disabled={enviando}
          size="sm"
          className="w-full"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Cadastrar rosto agora
        </Button>
        <Button
          type="button"
          onClick={aoFinalizar}
          disabled={enviando}
          variant="outline"
          size="sm"
          className="w-full"
        >
          Fazer depois na catraca
        </Button>
      </div>
      {capturando && (
        <CapturaRosto
          onPronta={(foto) => void enviarCaptura(foto)}
          onCancelar={() => setCapturando(false)}
        />
      )}
    </Bloco>
  );
}

/**
 * Quem já tem rosto no leitor mas ainda não está ligado a um aluno.
 * Mesmo padrão do vínculo em avaliar aluno: sugere por semelhança de nome,
 * mas quem decide é a pessoa — vínculo errado libera a pessoa errada.
 */
function CredenciaisSemVinculo({ partnerId, aoVincular }: { partnerId: string; aoVincular: () => void }) {
  const obter = useServerFn(obterCredenciaisSemVinculo);
  const vincular = useServerFn(vincularCredencial);
  const buscar = useServerFn(buscarAlunosParaMensalidade);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Array<{ studentId: string; nome: string }>>([]);
  // Filtro da própria lista de pendentes, que não é a mesma busca de aluno.
  const [filtroPend, setFiltroPend] = useState("");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [partnerId]);

  useEffect(() => {
    if (termo.trim().length < 3) { setAchados([]); return; }
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } }).then((r) => setAchados(r.alunos)).catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, partnerId]);

  const ligar = async (credencial: { referencia: string }, studentId: string) => {
    try {
      await vincular({ data: { partnerId, studentId, tipo: "facial", referencia: credencial.referencia } });
      toast.success("Vinculado.");
      setAberto(null); setTermo(""); carregar(); aoVincular();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível vincular.");
    }
  };

  const visiveisPend = useMemo(() => {
    const t = filtroPend.trim().toLowerCase();
    const todos = dados?.pendentes ?? [];
    if (!t) return todos;
    return todos.filter((c) =>
      (c.nome_no_equipamento ?? "").toLowerCase().includes(t) || c.referencia.toLowerCase().includes(t));
  }, [dados, filtroPend]);

  if (loading) return <Loader2 className="mx-auto my-5 h-5 w-5 animate-spin text-aca-acao" />;
  if (!dados || dados.total === 0) return null;

  return (
    // Rosto no leitor e ninguém ligado é gente que não entra: pede trabalho hoje.
    <Bloco tom="atencao" className="space-y-2">
      <p className="text-[12px] font-bold text-aca-ink">
        {dados.total} pessoa(s) no leitor sem aluno vinculado
      </p>
      <p className={NOTA}>
        O rosto já está no equipamento. Ligue cada uma ao aluno da plataforma —
        <strong className="font-semibold text-aca-ink"> ninguém precisa recadastrar</strong>. Sem vínculo, a pessoa não entra.
      </p>

      {/* Despejar as centenas de pendentes de uma vez enterra o resto da aba.
          Aqui a lista é de trabalho: procure a pessoa, ligue, siga. */}
      <input
        value={filtroPend}
        onChange={(e) => setFiltroPend(e.target.value)}
        placeholder="Procurar na lista por nome ou identificador"
        className={`w-full ${CAMPO}`}
      />

      {visiveisPend.length === 0 ? (
        <p className={`py-3 text-center ${NOTA}`}>Ninguém com esse nome ou identificador.</p>
      ) : null}

      {visiveisPend.slice(0, LIMITE_PENDENTES).map((c) => (
        <div key={c.id} className="rounded-lg border border-aca-line bg-aca-alto p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-aca-ink">
                {c.nome_no_equipamento || "Sem nome no leitor"}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-aca-muted">id {c.referencia}</p>
            </div>
            {aberto !== c.id && (
              <button
                type="button"
                onClick={() => { setAberto(c.id); setTermo(c.nome_no_equipamento || ""); }}
                className={`shrink-0 ${BOTAO_TEXTO}`}
              >
                Vincular
              </button>
            )}
          </div>

          {aberto === c.id && (
            <div className="mt-2 space-y-1.5 border-t border-aca-line pt-2">
              {c.sugestoes.length > 0 && (
                <>
                  <p className={EYEBROW}>Parecidos</p>
                  {c.sugestoes.map((s) => (
                    <button
                      key={s.student_id}
                      type="button"
                      onClick={() => void ligar(c, s.student_id)}
                      className={`flex w-full items-center justify-between gap-2 rounded bg-aca-surface px-2 py-1.5 text-left hover:bg-aca-line ${FOCO}`}
                    >
                      <span className="min-w-0 truncate text-sm text-aca-ink">{s.nome}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-aca-fraco">
                        {Math.round(s.semelhanca * 100)}%
                      </span>
                    </button>
                  ))}
                </>
              )}

              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar outro aluno pelo nome"
                className={`w-full ${CAMPO}`}
              />
              {achados.map((a) => (
                <button
                  key={a.studentId}
                  type="button"
                  onClick={() => void ligar(c, a.studentId)}
                  className={`w-full truncate rounded bg-aca-surface px-2 py-1.5 text-left text-sm text-aca-ink hover:bg-aca-line ${FOCO}`}
                >
                  {a.nome}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setAberto(null); setTermo(""); }}
                className={`w-full rounded px-2 py-1 text-[11px] text-aca-muted hover:bg-aca-surface ${FOCO}`}
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      ))}

      {visiveisPend.length > LIMITE_PENDENTES && (
        <p className={`pt-1 text-center ${NOTA}`}>
          Mostrando {LIMITE_PENDENTES} de {visiveisPend.length}. Use a busca acima para achar quem você quer ligar.
        </p>
      )}
    </Bloco>
  );
}

function AgenteAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterAgenteAcademia);
  const gerar = useServerFn(gerarCodigoAgente);
  const vincular = useServerFn(vincularCredencial);
  const buscarAlunos = useServerFn(buscarAlunosParaMensalidade);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [novoCodigo, setNovoCodigo] = useState<{ codigo: string; expira_em: string } | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Array<{ studentId: string; nome: string }>>([]);
  const [alvo, setAlvo] = useState<{ studentId: string; nome: string } | null>(null);
  const [ref, setRef] = useState("");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [partnerId]);

  useEffect(() => {
    if (termo.trim().length < 3) { setAchados([]); return; }
    const t = setTimeout(() => {
      buscarAlunos({ data: { partnerId, termo } })
        .then((r) => setAchados(r.alunos)).catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, partnerId]);

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;

  const pareados = dados.agentes.filter((a) => a.pareado_em);
  const pendentes = dados.agentes.filter((a) => !a.pareado_em && a.codigo_pareamento);

  return (
    <div className="space-y-3">
      <Bloco>
        <p className={NOTA}>
          O programa roda no PC da academia porque a porta da catraca é local.
          Ele baixa quem pode entrar e sobe as entradas.
        </p>
        <p className={`mt-1.5 ${NOTA}`}>
          Ele recebe <strong className="font-semibold text-aca-ink">só identificador e data</strong> — sem nome,
          sem CPF, sem contrato, sem valor. Toda a regra fica aqui.
        </p>
      </Bloco>

      <button
        type="button"
        onClick={async () => {
          try {
            const r = await gerar({ data: { partnerId } });
            setNovoCodigo({ codigo: r.codigo, expira_em: r.expira_em });
            carregar();
          } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
        }}
        className={`w-full ${BOTAO_ACAO}`}
      >
        <Plug className="h-4 w-4" />
        Gerar código de instalação
      </button>

      {novoCodigo && (
        <Bloco tom="ok" className="text-center">
          <p className={NOTA}>Digite este código no programa recém-instalado</p>
          {/* O código é o dado principal do cartão e sobe para o corpo de 28px
              do painel: quem está digitando no outro computador lê de longe. */}
          <p className="my-1 font-mono text-[28px] font-bold leading-none tracking-[0.2em] text-aca-ink">{novoCodigo.codigo}</p>
          <p className={NOTA}>
            Uso único, vale até {new Date(novoCodigo.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </Bloco>
      )}

      {pendentes.length > 0 && (
        <p className={`border-l-2 border-aca-atencao pl-2 ${NOTA}`}>
          {pendentes.length} código(s) aguardando instalação.
        </p>
      )}

      {pareados.map((a) => {
        const min = a.ultimo_contato_em
          ? Math.round((Date.now() - Date.parse(a.ultimo_contato_em)) / 60000) : null;
        const online = min !== null && min < 10;
        return (
          // Agente fora do ar é catraca parada: é o único estado desta aba que
          // manda alguém andar até a recepção.
          <Bloco key={a.id} tom={online ? "ok" : "critico"}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-aca-ink">{a.nome}</p>
                <p className={`mt-0.5 tabular-nums ${NOTA}`}>
                  {a.versao && `versão ${a.versao} · `}
                  {a.ultima_sync_em
                    ? `última sincronização ${new Date(a.ultima_sync_em).toLocaleString("pt-BR")}`
                    : "nunca sincronizou"}
                </p>
              </div>
              <Selo>{min === null ? "sem contato" : online ? "online" : `há ${min} min`}</Selo>
            </div>
          </Bloco>
        );
      })}

      <CadastrarRostoPelaFoto partnerId={partnerId} />

      <CredenciaisSemVinculo partnerId={partnerId} aoVincular={carregar} />

      <Bloco className="space-y-2">
        <p className={EYEBROW}>Pessoas vinculadas</p>
        <p className={NOTA}>
          {dados.credenciais.length} pessoa(s) ligada(s) ao leitor.
        </p>
        <p className={NOTA}>
          Para ligar mais alguém, use <strong className="font-semibold text-aca-ink">Cadastrar rosto pela foto</strong> acima,
          ou a lista de quem veio do leitor. O identificador dentro do
          equipamento é escolhido pelo sistema — ninguém precisa digitar número.
        </p>
      </Bloco>

      {/* Barrada de ontem já não pede nada — é registro, e registro é neutro. */}
      {dados.negados.length > 0 && (
        <Bloco>
          <p className={EYEBROW}>Tentaram e não entraram</p>
          <div className="mt-1.5 space-y-1">
            {dados.negados.map((n) => (
              <LinhaDado
                key={n.id}
                esquerda={`${n.referencia ?? "sem identificação"} — ${ESTADOS[n.motivo]?.label ?? n.motivo}`}
                direita={new Date(n.tentado_em).toLocaleString("pt-BR")}
              />
            ))}
          </div>
        </Bloco>
      )}

      {dados.entradas.length > 0 && (
        <Bloco>
          <p className={EYEBROW}>Últimas entradas</p>
          <div className="mt-1.5 space-y-1">
            {dados.entradas.map((e) => (
              <LinhaDado
                key={e.id}
                esquerda={e.nome}
                direita={`${e.origem} · ${new Date(e.entrada_em).toLocaleString("pt-BR")}`}
              />
            ))}
          </div>
        </Bloco>
      )}
    </div>
  );
}

/**
 * Cadastro dos planos que a recepção vende.
 *
 * Os quatro que existiam nasceram de uma migration — não havia jeito de criar o
 * quinto pela tela. Uma academia que abre promoção, aula avulsa ou cortesia
 * precisava de código para isso, e é o tipo de coisa que ela decide numa terça
 * à tarde.
 */
function PlanosAcademia({ partnerId }: { partnerId: string }) {
  const listar = useServerFn(listarPlanosParaGerir);
  const salvar = useServerFn(salvarPlanoAcademia);

  const vazio = { id: null as string | null, nome: "", valor: 0, dias: 30, limite: 0, ativo: true };
  const [planos, setPlanos] = useState<Array<{
    id: string; nome: string; valor_padrao: number; dias: number;
    limite_dias_semana: number | null; ativo: boolean;
  }>>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(vazio);
  const [aberto, setAberto] = useState(false);
  const [cortesia, setCortesia] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    listar({ data: { partnerId } })
      .then((r) => setPlanos(r.planos))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  };

  useEffect(carregar, [partnerId]);

  const gravar = async () => {
    setSalvando(true);
    try {
      await salvar({ data: {
        partnerId, id: form.id, nome: form.nome,
        // Cortesia é valor zero com nome. Não é erro de digitação, e por isso
        // não bloqueia nada: o lançamento entra com R$ 0,00 e o acesso vale igual.
        valorPadrao: cortesia ? 0 : form.valor,
        dias: form.dias,
        limiteDiasSemana: form.limite,
        ativo: form.ativo,
      } });
      setAberto(false);
      setForm(vazio);
      setCortesia(false);
      carregar();
      toast.success(form.id ? "Plano atualizado." : "Plano criado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const editar = (p: typeof planos[number]) => {
    setForm({
      id: p.id, nome: p.nome, valor: Number(p.valor_padrao ?? 0), dias: p.dias,
      limite: p.limite_dias_semana ?? 0, ativo: p.ativo,
    });
    setCortesia(Number(p.valor_padrao ?? 0) === 0);
    setAberto(true);
  };

  if (carregando) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-aca-acao" />;

  return (
    <Bloco className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-aca-ink">Planos da academia</p>
        {!aberto && (
          <button
            type="button"
            onClick={() => { setForm(vazio); setCortesia(false); setAberto(true); }}
            className={`shrink-0 px-3 py-1.5 text-[12px] ${BOTAO_ACAO}`}
          >
            <Plus className="h-3.5 w-3.5" /> Novo plano
          </button>
        )}
      </div>

      {aberto && (
        <div className="space-y-2 rounded-xl border border-aca-line-forte bg-aca-alto p-2.5">
          <input
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Nome do plano (ex.: Mensal - 3x semana)"
            className={`w-full ${CAMPO}`}
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-aca-muted">
              <input
                type="checkbox"
                checked={cortesia}
                onChange={(e) => setCortesia(e.target.checked)}
                className="h-3.5 w-3.5 accent-aca-acao"
              />
              Cortesia (sem valor)
            </label>
            {!cortesia && (
              <CurrencyInputBRL
                value={form.valor}
                onChange={(v) => setForm((f) => ({ ...f, valor: v }))}
                className={`w-32 ${CAMPO}`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={ROTULO}>Libera por</span>
            <input
              type="number" min={1} max={3650}
              value={form.dias}
              onChange={(e) => setForm((f) => ({ ...f, dias: Number(e.target.value) }))}
              className={`w-20 tabular-nums ${CAMPO}`}
            />
            <span className={ROTULO}>dias</span>
            {DURACOES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={form.dias === d}
                onClick={() => setForm((f) => ({ ...f, dias: d }))}
                className={`rounded-lg px-2 py-1 text-[11px] tabular-nums ${escolha(form.dias === d)}`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={ROTULO}>Entra na catraca</span>
            <select
              value={form.limite}
              onChange={(e) => setForm((f) => ({ ...f, limite: Number(e.target.value) }))}
              className={CAMPO}
            >
              {LIMITES_SEMANA.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-aca-muted">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
              className="h-3.5 w-3.5 accent-aca-acao"
            />
            Disponível para venda
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void gravar()}
              disabled={salvando || !form.nome.trim()}
              className={`flex-1 px-3 py-1.5 text-[12px] ${BOTAO_ACAO}`}
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {form.id ? "Salvar" : "Criar plano"}
            </button>
            <button
              type="button"
              onClick={() => { setAberto(false); setForm(vazio); }}
              className={`px-3 py-1.5 text-[12px] ${BOTAO_NEUTRO}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {planos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => editar(p)}
          className={`flex w-full items-center gap-2 rounded-xl border border-aca-line bg-aca-alto p-2.5 text-left hover:border-aca-line-forte ${FOCO}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-aca-ink">
              {p.nome}
              {!p.ativo && <span className="ml-1.5 text-[10px] font-normal text-aca-fraco">(desligado)</span>}
            </p>
            <p className={`tabular-nums ${NOTA}`}>
              {Number(p.valor_padrao) > 0 ? brl(Number(p.valor_padrao)) : "Cortesia"} · {p.dias} dias ·{" "}
              {p.limite_dias_semana ? `${p.limite_dias_semana}x por semana` : "todo dia"}
            </p>
          </div>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-aca-acao" />
        </button>
      ))}

      <p className={NOTA}>
        O plano vira opção na hora de lançar e renovar. O limite semanal viaja para
        a venda: quem comprou 3x continua com 3x mesmo que o plano mude depois.
      </p>
    </Bloco>
  );
}

function ProdutosMensalidade({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterProdutosMensalidade);
  const buscar = useServerFn(buscarProdutosParaVincular);
  const salvar = useServerFn(salvarProdutoMensalidade);
  const reprocessar = useServerFn(reprocessarMensalidadesPendentes);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Array<{ id: string; name: string }>>([]);
  const [novo, setNovo] = useState<{ id: string; name: string } | null>(null);
  const [dias, setDias] = useState(30);
  const [politica, setPolitica] = useState("justa");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [partnerId]);

  useEffect(() => {
    if (termo.trim().length < 3) { setAchados([]); return; }
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } })
        .then((r) => setAchados(r.produtos))
        .catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, partnerId]);

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-aca-acao" />;

  return (
    <div className="space-y-3">
      <Bloco>
        <p className={NOTA}>
          Nada de loja, checkout ou produto é criado aqui — tudo isso já existe.
          Isto só diz <strong className="font-semibold text-aca-ink">quais produtos liberam mensalidade</strong> nesta
          academia quando a compra é confirmada.
        </p>
        <p className={`mt-1.5 ${NOTA}`}>
          A liberação exige o pagamento aprovado pelo gateway configurado, não só
          o pedido criado.
        </p>
      </Bloco>

      <Bloco className="space-y-2">
        <p className={EYEBROW}>Vincular um produto</p>
        {novo ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-aca-alto px-2.5 py-1.5">
              <span className="truncate text-sm text-aca-ink">{novo.name}</span>
              <button type="button" onClick={() => setNovo(null)} aria-label="Escolher outro produto" className={BOTAO_ICONE}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number" min={1} value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                placeholder="Dias"
                className={`w-24 shrink-0 tabular-nums ${CAMPO}`}
              />
              <select
                value={politica} onChange={(e) => setPolitica(e.target.value)}
                className={`min-w-0 flex-1 ${CAMPO}`}
              >
                {POLITICAS_RENOVACAO.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await salvar({ data: { partnerId, productId: novo.id, plano: novo.name, diasValidade: dias, politica, ativo: true } });
                  setNovo(null); setTermo(""); carregar();
                  toast.success("Produto vinculado.");
                } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
              }}
              className={`w-full ${BOTAO_ACAO}`}
            >
              Vincular
            </button>
          </>
        ) : (
          <>
            <input
              value={termo} onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar produto pelo nome"
              className={`w-full ${CAMPO}`}
            />
            {achados.map((p) => (
              <button
                key={p.id} type="button" onClick={() => setNovo(p)}
                className={`w-full truncate rounded-lg bg-aca-alto px-2.5 py-1.5 text-left text-sm text-aca-ink hover:bg-aca-line ${FOCO}`}
              >
                {p.name}
              </button>
            ))}
          </>
        )}
      </Bloco>

      {dados.vinculos.length > 0 && (
        <div className="space-y-2">
          {dados.vinculos.map((v) => (
            // Vínculo desligado não libera compra nenhuma, e descobrir isso pela
            // reclamação do cliente é caro: a tarja diz qual está de pé.
            <Bloco key={v.id} tom={v.ativo ? "ok" : "neutro"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-aca-ink">
                    {dados.nomes[v.product_id] ?? v.plano}
                  </p>
                  <p className={`mt-0.5 tabular-nums ${NOTA}`}>
                    {v.dias_validade} dia(s) ·{" "}
                    {POLITICAS_RENOVACAO.find((p) => p.value === v.politica_renovacao)?.label ?? v.politica_renovacao}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-aca-muted">
                  <input
                    type="checkbox" checked={v.ativo}
                    onChange={async (e) => {
                      try {
                        await salvar({
                          data: {
                            partnerId, productId: v.product_id, plano: v.plano,
                            diasValidade: v.dias_validade, politica: v.politica_renovacao,
                            ativo: e.target.checked,
                          },
                        });
                        carregar();
                      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
                    }}
                    className="h-3.5 w-3.5 accent-aca-acao"
                  />
                  Ativo
                </label>
              </div>
            </Bloco>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={async () => {
          try {
            const r = await reprocessar({ data: { partnerId } });
            const partes = [
              r.geradas > 0 ? `${r.geradas} mensalidade(s)` : "",
              r.inscricoes > 0 ? `${r.inscricoes} inscrição(ões) em evento` : "",
            ].filter(Boolean);
            toast.success(partes.length
              ? `${partes.join(" e ")} de compras que ficaram para trás.`
              : "Nenhuma compra pendente — está tudo liberado.");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
        }}
        className={`w-full ${BOTAO_NEUTRO}`}
      >
        Procurar compras pagas que não liberaram nada
      </button>
    </div>
  );
}

function ProdutosEvento({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterProdutosEvento);
  const buscar = useServerFn(buscarProdutosParaVincular);
  const salvar = useServerFn(salvarProdutoEvento);
  const remover = useServerFn(removerProdutoEvento);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Awaited<ReturnType<typeof obter>> | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Array<{ id: string; name: string }>>([]);
  const [novo, setNovo] = useState<{ id: string; name: string } | null>(null);
  const [eventoId, setEventoId] = useState("");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [partnerId]);

  useEffect(() => {
    if (termo.trim().length < 3) { setAchados([]); return; }
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } })
        .then((r) => setAchados(r.produtos))
        .catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, partnerId]);

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  const rotuloEvento = (id: string) => {
    const e = dados.eventos.find((ev) => ev.id === id);
    return e ? `${e.nome} · ${formatDateOnlyBR(e.data_evento)}` : "Evento desligado ou apagado";
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] text-white/60">
          Aqui é o mesmo gancho, para <strong className="text-white/80">eventos</strong>: quando a
          compra é confirmada, o participante já nasce inscrito e com a credencial de entrada.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white">Vincular um produto a um evento</p>
        {dados.eventos.length === 0 ? (
          <p className="text-[11px] text-white/50">
            Nenhum evento ativo. Cadastre o evento na aba Eventos antes de vincular um produto.
          </p>
        ) : novo ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="truncate text-sm text-white">{novo.name}</span>
              <button type="button" onClick={() => setNovo(null)} className="shrink-0 text-white/50 hover:text-white">✕</button>
            </div>
            <select
              value={eventoId} onChange={(e) => setEventoId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
            >
              <option value="">Escolha o evento</option>
              {dados.eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome} · {formatDateOnlyBR(e.data_evento)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!eventoId}
              onClick={async () => {
                try {
                  await salvar({ data: { partnerId, productId: novo.id, eventoId, ativo: true } });
                  setNovo(null); setTermo(""); setEventoId(""); carregar();
                  toast.success("Produto vinculado ao evento.");
                } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
              }}
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              Vincular
            </button>
          </>
        ) : (
          <>
            <input
              value={termo} onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar produto pelo nome"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            {achados.map((p) => (
              <button
                key={p.id} type="button" onClick={() => setNovo(p)}
                className="w-full truncate rounded-lg bg-white/5 px-2.5 py-1.5 text-left text-sm text-white hover:bg-white/10"
              >
                {p.name}
              </button>
            ))}
          </>
        )}
      </div>

      {dados.vinculos.length > 0 && (
        <div className="space-y-2">
          {dados.vinculos.map((v) => (
            <div key={v.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {dados.nomes[v.product_id] ?? "Produto removido da loja"}
                  </p>
                  <p className="truncate text-[11px] text-white/50">{rotuloEvento(v.evento_id)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[10px] text-white/60">
                    <input
                      type="checkbox" checked={v.ativo}
                      onChange={async (e) => {
                        try {
                          await salvar({
                            data: {
                              partnerId, productId: v.product_id,
                              eventoId: v.evento_id, ativo: e.target.checked,
                            },
                          });
                          carregar();
                        } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
                      }}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    Ativo
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await remover({ data: { partnerId, id: v.id } });
                        carregar();
                        toast.success("Vínculo removido.");
                      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
                    }}
                    className="text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrmAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterCrmAcademia);
  const salvarRegra = useServerFn(salvarRegraCrm);
  const sincronizar = useServerFn(sincronizarCrmAcademia);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [quadros, setQuadros] = useState<Array<{ id: string; nome: string }>>([]);
  const [colunas, setColunas] = useState<Array<{ id: string; quadro_id: string; nome: string }>>([]);
  const [regras, setRegras] = useState<Record<string, { quadroId: string; colunaId: string; ativo: boolean }>>({});
  const [emVarios, setEmVarios] = useState<Array<{ nome: string; funis: number; quadros: string }>>([]);
  // O funil e a vista de trabalho; a automacao e configuracao, olhada de vez em quando.
  const [vista, setVista] = useState<"funil" | "automacao">("funil");

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => {
        setQuadros(r.quadros);
        setColunas(r.colunas);
        setEmVarios(r.emVariosFunis);
        const mapa: Record<string, { quadroId: string; colunaId: string; ativo: boolean }> = {};
        for (const g of r.regras) mapa[g.gatilho] = { quadroId: g.quadro_id, colunaId: g.coluna_id, ativo: g.ativo };
        setRegras(mapa);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [partnerId]);

  const aplicar = async (gatilho: string, next: { quadroId: string; colunaId: string; ativo: boolean }) => {
    setRegras((a) => ({ ...a, [gatilho]: next }));
    try {
      await salvarRegra({
        data: {
          partnerId, gatilho,
          quadroId: next.quadroId || null,
          colunaId: next.colunaId || null,
          ativo: next.ativo,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
      carregar();
    }
  };

  const rodar = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar({ data: { partnerId } });
      const base = r.criados > 0 ? `${r.criados} cartão(ões) criado(s).` : "Nenhum cartão novo.";
      toast.success(
        r.assumidos > 0
          ? `${base} ${r.assumidos} fora da automação — a equipe já assumiu.`
          : base,
      );
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar.");
    } finally {
      setSincronizando(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  /*
   * O quadro mora aqui, não só no painel de parceiro.
   *
   * A automação joga cartão num funil que só dava para abrir do outro lado do
   * sistema — quem cuida da academia tinha que sair daqui, entrar em Parceiro e
   * procurar o CRM para ver o trabalho que ela mesma gerou. Sem sentido: a
   * gestão da academia acontece nesta tela.
   */
  const quadroDaAcademia = quadros[0]?.id ?? null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVista("funil")}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${vista === "funil" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
        >
          Funil
        </button>
        <button
          type="button"
          onClick={() => setVista("automacao")}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${vista === "automacao" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
        >
          Automação
        </button>
      </div>

      {vista === "funil" && (
        quadroDaAcademia
          ? <CrmBoard quadroId={quadroDaAcademia} partnerId={partnerId} />
          : (
            <p className="py-8 text-center text-sm text-white/50">
              Esta unidade ainda não tem funil de CRM. Crie um na aba Automação
              escolhendo um quadro para as situações.
            </p>
          )
      )}

      {vista === "automacao" && (
      <>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] text-white/60">
          Usa os funis que já existem no CRM da unidade. Cada situação manda o
          aluno para o funil e a coluna que você escolher.
        </p>
        <p className="mt-1.5 text-[11px] text-white/60">
          A automação <strong className="text-white/80">só cria cartão novo</strong>.
          Se alguém mover o cartão, aquele aluno sai da automação e passa a ser
          tratado onde a equipe colocou.
        </p>
      </div>

      {emVarios.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-[11px] font-semibold text-amber-300">
            {emVarios.length} pessoa(s) em mais de um funil ao mesmo tempo
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">
            Não é erro — só avisando. A automação não mexe nesses cartões.
          </p>
          <div className="mt-1.5 space-y-0.5">
            {emVarios.slice(0, 8).map((p) => (
              <p key={p.nome} className="text-[11px] text-white/70">
                <strong className="text-white">{p.nome}</strong> — {p.quadros}
              </p>
            ))}
            {emVarios.length > 8 && (
              <p className="text-[11px] text-white/40">e mais {emVarios.length - 8}…</p>
            )}
          </div>
        </div>
      )}

      {quadros.length === 0 ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
          Esta unidade ainda não tem nenhum funil no CRM. Crie um na aba CRM
          (por exemplo, "Retenção") e volte aqui.
        </p>
      ) : (
        <>
          {GATILHOS_CRM.map((g) => {
            const atual = regras[g.value] ?? { quadroId: "", colunaId: "", ativo: true };
            const colunasDoQuadro = colunas.filter((c) => c.quadro_id === atual.quadroId);
            return (
              <div key={g.value} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-white">{g.label}</span>
                  {atual.quadroId && (
                    <label className="flex items-center gap-1.5 text-[10px] text-white/60">
                      <input
                        type="checkbox"
                        checked={atual.ativo}
                        onChange={(e) => void aplicar(g.value, { ...atual, ativo: e.target.checked })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Ativa
                    </label>
                  )}
                </div>
                <div className="flex gap-2">
                  <select
                    value={atual.quadroId}
                    onChange={(e) => void aplicar(g.value, { quadroId: e.target.value, colunaId: "", ativo: atual.ativo })}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
                  >
                    <option value="">Não criar cartão</option>
                    {quadros.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
                  </select>
                  <select
                    value={atual.colunaId}
                    onChange={(e) => void aplicar(g.value, { ...atual, colunaId: e.target.value })}
                    disabled={!atual.quadroId}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white disabled:opacity-40"
                  >
                    <option value="">Coluna…</option>
                    {colunasDoQuadro.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => void rodar()}
            disabled={sincronizando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KanbanSquare className="h-4 w-4" />}
            Gerar cartões agora
          </button>
        </>
      )}
      </>
      )}
    </div>
  );
}

function ModelosAviso({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterModelosAviso);
  const salvar = useServerFn(salvarModelosAviso);
  const criar = useServerFn(criarMarcoAviso);
  const mover = useServerFn(moverMarcoAviso);
  const excluir = useServerFn(excluirMarcoAviso);
  const reordenar = useServerFn(reordenarMarcosAviso);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [automatico, setAutomatico] = useState(false);
  const [carencia, setCarencia] = useState(3);
  const [modelos, setModelos] = useState<ModeloAviso[]>([]);
  // Cópia do que veio do servidor, só para saber se o dia mudou de verdade
  // antes de gastar uma ida ao banco a cada blur.
  const [original, setOriginal] = useState<ModeloAviso[]>([]);
  const [novo, setNovo] = useState({
    aberto: false, nome: "", texto: "",
    referencia: "vencimento" as ReferenciaAviso, quando: 5,
  });

  const carregar = () => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => {
        setAutomatico(r.automatico);
        setCarencia(r.carencia);
        setModelos(r.modelos);
        setOriginal(r.modelos);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [partnerId]);

  const gravar = async (silencioso = false) => {
    setSalvando(true);
    try {
      await salvar({ data: {
        partnerId, automatico,
        modelos: modelos.map((m) => ({ marco: m.marco, nome: m.nome, texto: m.texto, ativo: m.ativo })),
      } });
      if (!silencioso) toast.success("Mensagens salvas.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Mexer na estrutura recarrega a lista, e o que estivesse digitado sem salvar
   * se perderia. Grava antes, calado. No fim recarrega mesmo se deu erro: se o
   * banco recusou a mudança, a tela não pode continuar mostrando ela aplicada.
   */
  const estrutural = async (acao: () => Promise<unknown>) => {
    if (ocupado) return;
    setOcupado(true);
    if (!(await gravar(true))) { setOcupado(false); return; }
    try {
      await acao();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
    setOcupado(false);
    carregar();
  };

  const mexer = (i: number, mudanca: Partial<ModeloAviso>) =>
    setModelos((a) => a.map((x, j) => (j === i ? { ...x, ...mudanca } : x)));

  const comporQuando = (n: number, sentido: string) =>
    sentido === "depois" ? -Math.abs(n) : Math.abs(n);

  /** Só vai ao banco se o dia realmente mudou. */
  const comitarMomento = (m: ModeloAviso) => {
    const antes = original.find((o) => o.marco === m.marco);
    if (antes && antes.referencia === m.referencia && antes.quando === m.quando) return;
    void estrutural(() => mover({ data: {
      partnerId, marco: m.marco, referencia: m.referencia, quando: m.quando,
    } }));
  };

  const trocarOrdem = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= modelos.length) return;
    const nova = modelos.slice();
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setModelos(nova);
    void estrutural(() => reordenar({ data: { partnerId, marcos: nova.map((x) => x.marco) } }));
  };

  const apagar = (m: ModeloAviso) => {
    const certeza = window.confirm(
      `Apagar o aviso "${m.nome}"?\n\nAs mensagens que já foram geradas continuam no histórico — só para de disparar daqui pra frente.`,
    );
    if (!certeza) return;
    void estrutural(() => excluir({ data: { partnerId, marco: m.marco } }));
  };

  const criarNovo = () =>
    void estrutural(async () => {
      await criar({ data: {
        partnerId, nome: novo.nome, texto: novo.texto,
        referencia: novo.referencia, quando: novo.quando,
      } });
      setNovo({ aberto: false, nome: "", texto: "", referencia: "vencimento", quando: 5 });
      toast.success("Aviso criado.");
    });

  if (loading) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-primary" />;

  const campo = "rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white";

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-sm font-bold text-white">Mensagens e automação</p>

      <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <input
          type="checkbox"
          checked={automatico}
          onChange={(e) => setAutomatico(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="text-[11px] text-white/70">
          <strong className="text-white">Montar campanhas automaticamente todo dia</strong>
          <br />
          Só MONTA. Nada é enviado por causa desta caixa: as campanhas aparecem
          prontas na aba Robô e alguém precisa disparar. Quem envia sozinho é a
          outra opção, em <strong className="text-white">Avisos de vencimento</strong>.
        </span>
      </label>

      {modelos.map((m, i) => (
        <div key={m.marco} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <button
                type="button" title="Subir"
                disabled={i === 0 || ocupado}
                onClick={() => trocarOrdem(i, -1)}
                className="rounded p-0.5 text-white/40 hover:text-white disabled:opacity-20"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button" title="Descer"
                disabled={i === modelos.length - 1 || ocupado}
                onClick={() => trocarOrdem(i, 1)}
                className="rounded p-0.5 text-white/40 hover:text-white disabled:opacity-20"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <input
              value={m.nome}
              onChange={(e) => mexer(i, { nome: e.target.value })}
              placeholder="Nome do aviso"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] font-bold text-white placeholder:text-white/30"
            />

            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={m.ativo}
                onChange={(e) => mexer(i, { ativo: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary"
              />
              Ativo
            </label>

            <button
              type="button" title="Apagar"
              disabled={ocupado}
              onClick={() => apagar(m)}
              className="shrink-0 rounded p-1 text-white/30 hover:text-red-400 disabled:opacity-20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            <span className="text-[11px] text-white/40">Dispara</span>
            <input
              type="number" min={0} max={LIMITE_DIAS_AVISO}
              value={Math.abs(m.quando)}
              disabled={ocupado}
              onChange={(e) => mexer(i, {
                quando: comporQuando(Number(e.target.value), m.quando >= 0 ? "antes" : "depois"),
              })}
              onBlur={() => comitarMomento(modelos[i])}
              className={`w-14 ${campo}`}
            />
            <span className="text-[11px] text-white/40">dia(s)</span>
            <select
              value={m.quando >= 0 ? "antes" : "depois"}
              disabled={ocupado || m.quando === 0}
              onChange={(e) => {
                const q = comporQuando(Math.abs(m.quando), e.target.value);
                mexer(i, { quando: q });
                comitarMomento({ ...m, quando: q });
              }}
              className={campo}
            >
              <option value="antes">antes</option>
              <option value="depois">depois</option>
            </select>
            <select
              value={m.referencia}
              disabled={ocupado}
              onChange={(e) => {
                const r = e.target.value as ReferenciaAviso;
                mexer(i, { referencia: r });
                comitarMomento({ ...m, referencia: r });
              }}
              className={campo}
            >
              <option value="vencimento">do vencimento</option>
              <option value="bloqueio">do bloqueio</option>
            </select>
            <span className="text-[10px] text-white/35">
              {descreverMomento(m.referencia, m.quando)}
            </span>
          </div>

          <textarea
            value={m.texto}
            onChange={(e) => mexer(i, { texto: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/40"
          />
        </div>
      ))}

      {novo.aberto ? (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
          <p className="text-[11px] font-bold text-white">Novo aviso</p>
          <input
            value={novo.nome}
            onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
            placeholder="Nome (ex.: Faltam 10 dias)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white placeholder:text-white/30"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-white/40">Dispara</span>
            <input
              type="number" min={0} max={LIMITE_DIAS_AVISO}
              value={Math.abs(novo.quando)}
              onChange={(e) => setNovo((n) => ({
                ...n, quando: comporQuando(Number(e.target.value), n.quando >= 0 ? "antes" : "depois"),
              }))}
              className={`w-14 ${campo}`}
            />
            <span className="text-[11px] text-white/40">dia(s)</span>
            <select
              value={novo.quando >= 0 ? "antes" : "depois"}
              onChange={(e) => setNovo((n) => ({ ...n, quando: comporQuando(Math.abs(n.quando), e.target.value) }))}
              className={campo}
            >
              <option value="antes">antes</option>
              <option value="depois">depois</option>
            </select>
            <select
              value={novo.referencia}
              onChange={(e) => setNovo((n) => ({ ...n, referencia: e.target.value as ReferenciaAviso }))}
              className={campo}
            >
              <option value="vencimento">do vencimento</option>
              <option value="bloqueio">do bloqueio</option>
            </select>
          </div>
          <textarea
            value={novo.texto}
            onChange={(e) => setNovo((n) => ({ ...n, texto: e.target.value }))}
            rows={2}
            placeholder="Oi {nome}! ..."
            className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/40"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={criarNovo}
              disabled={ocupado}
              className="flex-1 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Criar aviso
            </button>
            <button
              type="button"
              onClick={() => setNovo((n) => ({ ...n, aberto: false }))}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNovo((n) => ({ ...n, aberto: true }))}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 px-4 py-2 text-[12px] font-bold text-white/70 hover:border-white/40 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo aviso
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-white/50">
        <code className="rounded bg-white/10 px-1">{"{nome}"}</code> vira o primeiro nome de quem recebe.{" "}
        <code className="rounded bg-white/10 px-1">{"{data}"}</code> vira a data de vencimento.
        <br />
        <strong className="text-white/70">Bloqueio</strong> é o último dia em que a pessoa ainda
        entra: {carencia} dia(s) depois do vencimento. Mudar a carência move todos os avisos
        de bloqueio junto.
        <br />
        Se dois avisos caírem no mesmo dia, sai só o de cima — e ninguém recebe mais de uma
        mensagem por dia.
      </p>

      <button
        type="button"
        onClick={() => void gravar()}
        disabled={salvando || ocupado}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar mensagens
      </button>
    </div>
  );
}

function AvisosVencimento({ partnerId }: { partnerId: string }) {
  const preview = useServerFn(previewAvisosAcademia);
  const preparar = useServerFn(prepararAvisosAcademia);
  const obterAuto = useServerFn(obterAutomacaoAvisos);
  const salvarAuto = useServerFn(salvarAutomacaoAvisos);
  const [auto, setAuto] = useState<{ automatico: boolean; hora: number; dias: number[] } | null>(null);
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preparando, setPreparando] = useState(false);
  const [dados, setDados] = useState<{
    rotulos: Record<string, string>;
    comTelefone: Array<{ student_id: string | null; credencial_id: string | null; nome: string; telefone: string | null; marco: string; valido_ate: string }>;
    semTelefone: Array<{ student_id: string | null; credencial_id: string | null; nome: string; marco: string }>;
    conexao: { nome: string; status: string } | null;
  } | null>(null);

  const carregar = () => {
    setLoading(true);
    preview({ data: { partnerId } })
      .then((r) => setDados(r as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [partnerId]);
  useEffect(() => {
    obterAuto({ data: { partnerId } })
      .then((r) => setAuto({ automatico: r.automatico, hora: r.hora, dias: r.dias }))
      .catch(() => setAuto(null));
  }, [partnerId]);

  const gravarAuto = async (patch: Partial<{ automatico: boolean; hora: number; dias: number[] }>) => {
    if (!auto) return;
    const novo = { ...auto, ...patch };
    setSalvandoAuto(true);
    try {
      await salvarAuto({ data: { partnerId, ...novo } });
      setAuto(novo);
      toast.success(
        novo.automatico
          ? `Envio automático ligado: ${rotuloDias(novo.dias)} às ${String(novo.hora).padStart(2, "0")}h.`
          : "Envio automático desligado. As campanhas continuam sendo montadas para você disparar.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvandoAuto(false);
    }
  };

  const confirmar = async () => {
    setPreparando(true);
    try {
      const r = await preparar({ data: { partnerId } });
      toast.success(
        `${r.disparos} campanha(s) criada(s) com ${r.preparados} contato(s). Abra a aba Robô para disparar.`,
      );
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível preparar.");
    } finally {
      setPreparando(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;
  if (!dados) return null;

  const conectado = dados.conexao?.status === "conectado";
  const total = dados.comTelefone.length;

  return (
    <div className="space-y-3">
      {/* Nasce DESLIGADO. Isto não é um ajuste de preferência: é a academia
          autorizando o sistema a falar com os clientes dela sem ninguém ler
          antes. Mensagem automática errada não se conserta depois — o que se
          perde é o chip. */}
      {auto && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={auto.automatico}
              disabled={salvandoAuto}
              onChange={(e) => void gravarAuto({ automatico: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-white">Enviar sozinho, sem eu apertar nada</span>
              <span className="block text-[11px] text-white/50">
                As campanhas do dia já são montadas de manhã. Ligando isto, elas saem no horário
                marcado. <strong className="text-white/80">Só as que o sistema montou</strong> —
                campanha que você escreveu na aba Robô nunca sai sozinha, mesmo com isto ligado.
              </span>
            </span>
          </label>

          {auto.automatico && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <span className="text-[10px] uppercase tracking-wider text-white/40">às</span>
              <select
                value={auto.hora}
                disabled={salvandoAuto}
                onChange={(e) => void gravarAuto({ hora: Number(e.target.value) })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
              <span className="text-[10px] uppercase tracking-wider text-white/40">em</span>
              <div className="flex gap-1">
                {DIAS_CURTOS.map((d, i) => {
                  const on = auto.dias.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={salvandoAuto}
                      onClick={() =>
                        void gravarAuto({
                          dias: on ? auto.dias.filter((x) => x !== i) : [...auto.dias, i].sort(),
                        })
                      }
                      className={`w-9 rounded-lg py-1.5 text-[11px] font-bold transition ${on ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <span className="w-full text-[11px] text-white/50">
                Horário da academia. Nada sai fora dessa janela, e nada sai duas vezes.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] text-white/60">
          Usa a mesma régua que libera a catraca. Cada pessoa entra uma única vez
          por vencimento — rodar de novo não repete ninguém.
        </p>
        <p className="mt-1.5 text-[11px] text-white/60">
          Este botão <strong className="text-white/80">monta a campanha</strong> e
          para aí. O envio acontece na aba <strong className="text-white/80">Robô</strong>,
          que é onde ficam o limite diário do número e o intervalo entre
          mensagens — mandar por fora disso queima o chip da academia.
        </p>
      </div>

      {!dados.conexao && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
          Esta academia não tem conexão de WhatsApp configurada. Sem ela não há como enviar.
        </p>
      )}
      {dados.conexao && !conectado && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
          A conexão "{dados.conexao.nome}" está {dados.conexao.status}. Reconecte antes de enviar.
        </p>
      )}

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">Ninguém para avisar hoje.</p>
      ) : (
        <div className="space-y-2">
          {dados.comTelefone.map((a) => (
            <div key={`${a.credencial_id ?? a.student_id}-${a.marco}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{a.nome}</p>
                <p className="text-[11px] text-white/50">{a.telefone}</p>
              </div>
              <span className="shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                {dados.rotulos[a.marco] ?? ROTULO_MARCO[a.marco] ?? a.marco}
              </span>
            </div>
          ))}
        </div>
      )}

      {dados.semTelefone.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] font-semibold text-white/70">
            {dados.semTelefone.length} sem telefone cadastrado — não serão avisados
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            {dados.semTelefone.map((a) => a.nome).join(", ")}
          </p>
        </div>
      )}

      {total > 0 && (
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={preparando || !conectado}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Montar campanha com {total} contato(s)
        </button>
      )}

      <ModelosAviso partnerId={partnerId} />
    </div>
  );
}

function ListaAlunos({ partnerId }: { partnerId: string }) {
  const listar = useServerFn(listarAlunosAcademia);
  const cancelar = useServerFn(cancelarMensalidadeAcademia);
  const corrigir = useServerFn(corrigirMensalidadeAcademia);
  const prever = useServerFn(preverCancelamentoAcademia);
  // Até quando o aluno fica liberado DEPOIS de cancelar. Nulo = não sobra
  // mensalidade nenhuma, ele fica sem acesso.
  const [depoisDe, setDepoisDe] = useState<string | null>(null);
  const [preverPronto, setPreverPronto] = useState(false);
  // Correcao de lancamento errado. Cancelar e lancar de novo tira o aluno da
  // liberacao no meio do caminho -- com fila na porta isso nao serve.
  const [corrigindoId, setCorrigindoId] = useState<string | null>(null);
  const [corr, setCorr] = useState({ valor: 0, forma: "dinheiro", ate: "", motivo: "" });
  const [salvandoCorr, setSalvandoCorr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Array<{
    id: string; student_id: string | null; credencial_id: string | null;
    referencia: string | null; nome: string; sem_rosto_no_leitor?: boolean;
    plano: string; valido_ate: string;
    dias_restantes: number | null; decisao: string; motivo: string; valor: number;
  }>>([]);
  // id do lançamento com o formulário de renovação aberto
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  // Cadastro de balcão: quem não é da FitMind não existia em lugar nenhum e
  // por isso não podia ser lançado. Depois de criar, a renovação abre na hora.
  const [cadastrando, setCadastrando] = useState(false);
  const [pessoaNova, setPessoaNova] = useState<{ credencialId: string; nome: string; referencia: string } | null>(null);
  const [pessoaParaRosto, setPessoaParaRosto] = useState<{ credencialId: string; nome: string; referencia: string } | null>(null);
  // Ficha completa do aluno: reaproveita o mesmo modal do painel do coach, com
  // resumo, frequência, avaliações, anamnese, evolução, compras e treinos.
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [treinoDe, setTreinoDe] = useState<{ id: string; nome: string } | null>(null);
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

  const confirmarCorrecao = async (mensalidadeId: string) => {
    if (corr.motivo.trim().length < 3) {
      toast.error("Descreva o que está sendo corrigido.");
      return;
    }
    setSalvandoCorr(true);
    try {
      await corrigir({ data: {
        partnerId, mensalidadeId,
        valor: corr.valor, formaPagamento: corr.forma,
        validoAte: corr.ate, motivo: corr.motivo.trim(),
      } });
      setCorrigindoId(null);
      recarregar();
      toast.success("Lançamento corrigido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível corrigir.");
    } finally {
      setSalvandoCorr(false);
    }
  };

  const confirmarCancelamento = async (mensalidadeId: string) => {
    if (motivo.trim().length < 3) {
      toast.error("Descreva o motivo do cancelamento.");
      return;
    }
    setSalvandoCancel(true);
    try {
      await cancelar({ data: {
        partnerId, mensalidadeId, status: tipoCancel, motivo: motivo.trim(),
        ajustarValidoAte: depoisDe,
      } });
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

  // Recarrega depois de renovar: o vencimento e o selo de estado mudam na hora,
  // e a recepção precisa ver que a renovação pegou sem sair da tela.
  const recarregar = () => {
    listar({ data: { partnerId } })
      .then((r) => setLinhas(r.alunos as never))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"));
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

  // Busca também pelo identificador do leitor: é o número que a recepção tem em
  // mãos quando alguém para na catraca e não passa.
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) =>
      (filtro === "todos" || l.motivo === filtro) &&
      (!t || l.nome.toLowerCase().includes(t) || (l.referencia ?? "").toLowerCase().includes(t))
    );
  }, [linhas, filtro, busca]);

  if (loading) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou identificador"
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

      {!cadastrando && !pessoaNova && (
        <button
          type="button"
          onClick={() => { setCadastrando(true); setRenovandoId(null); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"
        >
          <UserPlus className="h-3.5 w-3.5" /> Cadastrar pessoa nova (não é da FitMind)
        </button>
      )}

      {cadastrando && (
        <CadastrarPessoaAcademia
          partnerId={partnerId}
          aoCriar={(p) => { setCadastrando(false); setPessoaNova(p); }}
          aoCancelar={() => setCadastrando(false)}
        />
      )}

      {pessoaNova && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-bold text-white">{pessoaNova.nome}</p>
          <p className="text-[11px] text-white/50">
            Identificador <span className="font-mono text-white/70">{pessoaNova.referencia}</span>
          </p>
          <RenovarAluno
            partnerId={partnerId}
            credencialId={pessoaNova.credencialId}
            studentId={null}
            nome={pessoaNova.nome}
            aoConcluir={() => {
              setPessoaParaRosto(pessoaNova);
              setPessoaNova(null);
              recarregar();
            }}
            aoCancelar={() => setPessoaNova(null)}
          />
        </div>
      )}

      {pessoaParaRosto && (
        <RostoDepoisDoCadastro
          partnerId={partnerId}
          pessoa={pessoaParaRosto}
          aoFinalizar={() => setPessoaParaRosto(null)}
        />
      )}



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
                    {/* Ficha completa só existe para quem é aluno da plataforma.
                        Aluno só da academia mora na credencial do leitor e não
                        tem ficha — o botão sumir é melhor do que abrir vazio. */}
                    {l.student_id ? (
                      <button
                        type="button"
                        onClick={() => setFichaId(l.student_id)}
                        className="flex items-center gap-1.5 text-left font-semibold text-white hover:text-primary"
                      >
                        <span className="truncate">{l.nome}</span>
                        <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </button>
                    ) : (
                      <p className="truncate font-semibold text-white">{l.nome}</p>
                    )}
                    <p className="text-[11px] text-white/50">
                      {l.plano} · {brl(Number(l.valor) || 0)}
                      {l.referencia && (
                        <> · <span className="font-mono text-white/70">id {l.referencia}</span></>
                      )}
                    </p>
                    {/* Mensalidade em dia não basta: sem rosto no equipamento o
                        leitor nunca reconhece a pessoa, e a catraca nunca chega
                        a ser acionada. Dizer isso aqui evita a recepção mandar
                        alguém para a porta achando que está resolvido. */}
                    {l.sem_rosto_no_leitor && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        <Camera className="h-3 w-3" /> Falta cadastrar o rosto — não passa na catraca
                      </p>
                    )}
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
                    <Pilula tom={e.tom}>{e.label}</Pilula>
                    {abertoId !== l.id && renovandoId !== l.id && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setRenovandoId(l.id); setAbertoId(null); }}
                          className="flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/25"
                        >
                          <RefreshCw className="h-3 w-3" /> Renovar
                        </button>
                        {l.student_id && (
                          <button
                            type="button"
                            onClick={() => setTreinoDe({ id: l.student_id as string, nome: l.nome })}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                          >
                            <Dumbbell className="h-3 w-3" /> Treino
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCorrigindoId(l.id);
                            setAbertoId(null);
                            setRenovandoId(null);
                            setCorr({ valor: l.valor ?? 0, forma: "dinheiro", ate: l.valido_ate, motivo: "" });
                          }}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-3 w-3" /> Corrigir
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAbertoId(l.id);
                            setCorrigindoId(null);
                            setRenovandoId(null);
                            setMotivo("");
                            setTipoCancel("cancelada");
                            setDepoisDe(null);
                            setPreverPronto(false);
                            void prever({ data: { partnerId, mensalidadeId: l.id } })
                              .then((r) => setDepoisDe(r.valeAteDepois))
                              .catch(() => setDepoisDe(null))
                              .finally(() => setPreverPronto(true));
                          }}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Ban className="h-3 w-3" /> Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {renovandoId === l.id && (
                  <RenovarAluno
                    partnerId={partnerId}
                    credencialId={l.credencial_id}
                    studentId={l.student_id}
                    nome={l.nome}
                    vencimentoAtual={l.valido_ate}

                    aoConcluir={() => { setRenovandoId(null); recarregar(); }}
                    aoCancelar={() => setRenovandoId(null)}
                  />
                )}

                {corrigindoId === l.id && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[11px] text-white/60">
                      Corrige o lançamento no lugar, sem tirar o aluno da liberação.
                      O valor anterior fica registrado na observação.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <CurrencyInputBRL
                        value={corr.valor}
                        onChange={(v) => setCorr((c) => ({ ...c, valor: v }))}
                        className="w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                      <select
                        value={corr.forma}
                        onChange={(ev) => setCorr((c) => ({ ...c, forma: ev.target.value }))}
                        className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
                      >
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={corr.ate}
                        onChange={(ev) => setCorr((c) => ({ ...c, ate: ev.target.value }))}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <input
                      value={corr.motivo}
                      onChange={(ev) => setCorr((c) => ({ ...c, motivo: ev.target.value }))}
                      placeholder="O que está sendo corrigido (obrigatório)"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setCorrigindoId(null)}
                        disabled={salvandoCorr}
                        className="rounded-xl px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmarCorrecao(l.id)}
                        disabled={salvandoCorr}
                        className="flex items-center gap-1.5 rounded-xl bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/30 disabled:opacity-50"
                      >
                        {salvandoCorr ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                        Salvar correção
                      </button>
                    </div>
                  </div>
                )}

                {abertoId === l.id && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[11px] text-white/60">
                      O lançamento continua no histórico financeiro e deixa de valer para acesso.
                    </p>

                    {/*
                      Onde o acesso vai parar, antes de confirmar.
                      Cancelar sem ver isso é o tipo de coisa que só aparece dois
                      dias depois, com a pessoa barrada na porta e ninguém ligando
                      uma coisa à outra.
                    */}
                    {!preverPronto ? (
                      <p className="text-[11px] text-white/40">Conferindo até quando ele fica liberado…</p>
                    ) : depoisDe ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                        <span className="text-[11px] text-white/60">Depois de cancelar, o acesso vai até</span>
                        <input
                          type="date"
                          value={depoisDe}
                          onChange={(ev) => setDepoisDe(ev.target.value)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
                        />
                        <span className="text-[10px] text-white/40">dá para mudar</span>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-red-400/20 bg-red-500/5 p-2 text-[11px] text-red-300">
                        Não sobra nenhuma mensalidade ativa: o aluno fica <strong>sem acesso</strong> assim que
                        você confirmar.
                      </p>
                    )}
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

      {fichaId && <StudentDetailsModal studentId={fichaId} onClose={() => setFichaId(null)} />}
      {treinoDe && (
        <TreinosAluno
          partnerId={partnerId}
          studentId={treinoDe.id}
          nomeAluno={treinoDe.nome}
          onClose={() => setTreinoDe(null)}
        />
      )}
    </div>
  );
}

/**
 * Registrar / renovar — o mesmo lançamento da aba de alunos.
 *
 * O formulário antigo era outro caminho para a mesma tabela: exigia aluno da
 * plataforma, plano digitado à mão, data digitada à mão e uma única forma de
 * pagamento — e por isso não gravava o detalhamento por forma que o relatório
 * usa. Agora as duas abas usam a mesma busca, os mesmos planos e a mesma
 * régua de data e taxa.
 */
function FormMensalidade({ partnerId }: { partnerId: string }) {
  const buscar = useServerFn(buscarPessoasAcademia);
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<PessoaAcademia[]>([]);
  const [pessoa, setPessoa] = useState<PessoaAcademia | null>(null);
  const [pessoaParaRosto, setPessoaParaRosto] = useState<{ credencialId: string; nome: string; referencia: string } | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (pessoa || termo.trim().length < 3) { setOpcoes([]); return; }
    let alive = true;
    setBuscando(true);
    const t = setTimeout(() => {
      buscar({ data: { partnerId, termo } })
        .then((r) => { if (alive) setOpcoes(r.pessoas); })
        .catch(() => {})
        .finally(() => { if (alive) setBuscando(false); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [termo, partnerId, pessoa]);

  const limpar = () => { setPessoa(null); setTermo(""); setOpcoes([]); };

  const concluirMensalidade = () => {
    if (pessoa?.credencialId && !pessoa.studentId && pessoa.referencia) {
      setPessoaParaRosto({
        credencialId: pessoa.credencialId,
        nome: pessoa.nome,
        referencia: pessoa.referencia,
      });
    }
    limpar();
  };

  return (
    <div className="space-y-3">
      {!pessoa && !cadastrando && !pessoaParaRosto && (
        <>
          <Campo label="Quem está pagando">
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, telefone ou identificador da catraca"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            {buscando && <p className="mt-1 text-[11px] text-white/40">Buscando…</p>}
            {opcoes.length > 0 && (
              <div className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#141414]">
                {opcoes.map((o, i) => (
                  <button
                    key={`${o.credencialId ?? o.studentId}-${i}`}
                    type="button"
                    onClick={() => { setPessoa(o); setOpcoes([]); }}
                    className="block w-full px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span className="block text-sm text-white">{o.nome}</span>
                    <span className="block text-[11px] text-white/45">
                      {o.referencia ? `id ${o.referencia}` : o.studentId ? "aluno FitMind" : "cadastro da academia"}
                      {o.validoAte ? ` · vence ${formatDateOnlyBR(o.validoAte)}` : " · sem mensalidade"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Campo>

          <button
            type="button"
            onClick={() => setCadastrando(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"
          >
            <UserPlus className="h-3.5 w-3.5" /> Cadastrar pessoa nova (não é da FitMind)
          </button>
        </>
      )}

      {cadastrando && (
        <CadastrarPessoaAcademia
          partnerId={partnerId}
          aoCriar={(p) => {
            setCadastrando(false);
            setPessoa({
              credencialId: p.credencialId, studentId: null,
              nome: p.nome, referencia: p.referencia, validoAte: null,
            });
          }}
          aoCancelar={() => setCadastrando(false)}
        />
      )}

      {pessoa && !pessoaParaRosto && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{pessoa.nome}</p>
              <p className="text-[11px] text-white/50">
                {pessoa.referencia ? <>Identificador <span className="font-mono text-white/70">{pessoa.referencia}</span></> : "Aluno FitMind"}
                {pessoa.validoAte ? ` · vence ${formatDateOnlyBR(pessoa.validoAte)}` : ""}
              </p>
            </div>
            <button type="button" onClick={limpar} className="text-[11px] text-primary">trocar</button>
          </div>
          <RenovarAluno
            partnerId={partnerId}
            credencialId={pessoa.credencialId}
            studentId={pessoa.studentId}
            nome={pessoa.nome}
            vencimentoAtual={pessoa.validoAte}
            aoConcluir={concluirMensalidade}
            aoCancelar={limpar}
          />
        </div>
      )}

      {pessoaParaRosto && (
        <RostoDepoisDoCadastro
          partnerId={partnerId}
          pessoa={pessoaParaRosto}
          aoFinalizar={() => setPessoaParaRosto(null)}
        />
      )}
    </div>
  );
}


/**
 * Os dias em que a academia não abre.
 *
 * Sem esta lista, no 7 de setembro o robô diria "estamos abertos" e marcaria
 * aula experimental para uma porta fechada — e quem aparecesse não voltaria.
 */
function FeriadosDaAcademia({ partnerId }: { partnerId: string }) {
  const listar = useServerFn(listarFeriados);
  const salvar = useServerFn(salvarFeriado);
  const excluir = useServerFn(excluirFeriado);
  const [lista, setLista] = useState<Array<{ id: string; data: string; nome: string }>>([]);
  const [dia, setDia] = useState("");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    listar({ data: { partnerId } })
      .then((r) => setLista(r.feriados))
      .catch(() => setLista([]));
  };
  useEffect(carregar, [partnerId]);

  const adicionar = async () => {
    setSalvando(true);
    try {
      await salvar({ data: { partnerId, data: dia, nome } });
      setDia(""); setNome("");
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    try {
      await excluir({ data: { partnerId, id } });
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui remover.");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Dias em que não abrimos</p>
      <p className="mb-2 text-[11px] text-white/50">
        O robô para de marcar aula experimental nesses dias e avisa qual é o feriado.
        Feriado nacional não fecha toda academia — cadastre só os seus.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        />
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: 7 de Setembro, reforma, férias"
          className="min-w-[160px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <button
          type="button"
          onClick={() => void adicionar()}
          disabled={salvando || !dia || nome.trim().length < 2}
          className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      {lista.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lista.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
              {f.data.slice(8, 10)}/{f.data.slice(5, 7)} · {f.nome}
              <button
                type="button"
                onClick={() => void remover(f.id)}
                aria-label={`Remover ${f.nome}`}
                className="text-white/40 hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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

      <FeriadosDaAcademia partnerId={partnerId} />

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

export default AcademiaTestePanel;
