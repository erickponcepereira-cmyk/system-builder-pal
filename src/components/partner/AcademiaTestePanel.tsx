import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, Save, Dumbbell, Ban, Send, Ticket, FileText, KanbanSquare } from "lucide-react";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import {
  FORMAS_PAGAMENTO,
  buscarAlunosParaMensalidade,
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
  listarAlunosAcademia,
  aplicarModeloTreino,
  criarEventoAcademia,
  inscreverNoEvento,
  obterConfigAcademia,
  obterEventosAcademia,
  obterCrmAcademia,
  obterFrequenciaAcademia,
  obterModelosAviso,
  obterProdutosMensalidade,
  obterTreinosAluno,
  prepararAvisosAcademia,
  previewAvisosAcademia,
  previewTaxaAcademia,
  registrarDayUse,
  registrarMensalidadeAcademia,
  reprocessarMensalidadesPendentes,
  salvarProdutoMensalidade,
  salvarConfigAcademia,
  salvarConfigFrequencia,
  salvarModelosAviso,
  salvarRegraCrm,
  salvarTurma,
  sincronizarCrmAcademia,
  validarCredencialEvento,
  type FormaPagamento,
} from "@/lib/academia-teste.functions";

type SubAba = "alunos" | "mensalidade" | "produtos" | "frequencia" | "avisos" | "crm" | "dayuse" | "eventos" | "config";

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
            ["frequencia", "Frequência"],
            ["avisos", "Avisos de vencimento"],
            ["crm", "CRM"],
            ["produtos", "Produtos que liberam"],
            ["dayuse", "Day-use"],
            ["eventos", "Eventos"],
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
        {sub === "avisos" && <AvisosVencimento partnerId={partnerId} />}
        {sub === "frequencia" && <Frequencia partnerId={partnerId} />}
        {sub === "crm" && <CrmAcademia partnerId={partnerId} />}
        {sub === "dayuse" && <DayUse partnerId={partnerId} />}
        {sub === "produtos" && <ProdutosMensalidade partnerId={partnerId} />}
        {sub === "eventos" && <Eventos partnerId={partnerId} />}
        {sub === "config" && <ConfigAcademia partnerId={partnerId} />}
      </div>
    </TestSurfaceGate>
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
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] text-white/60">
          Caminho separado da mensalidade. A regra de quantas vezes cada CPF pode
          entrar é a que estiver em Configurações.
        </p>
        <p className="mt-1.5 text-[11px] text-white/60">
          O CPF é guardado como código embaralhado, não como número — só os 3
          últimos dígitos ficam visíveis para a recepção conferir com o documento.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={cpf}
          onChange={(e) => { setCpf(e.target.value); setVeredito(null); }}
          placeholder="CPF de quem vai entrar"
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <button
          type="button"
          onClick={() => void checar()}
          disabled={checando || digitos.length !== 11}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
        >
          {checando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </button>
      </div>

      {veredito && (
        <div className={`rounded-xl border p-3 ${liberado ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className={`text-sm font-bold ${liberado ? "text-green-400" : "text-red-400"}`}>
            {MOTIVO_DAYUSE[veredito.motivo] ?? veredito.motivo}
          </p>
          {veredito.usos > 0 && (
            <p className="mt-0.5 text-[11px] text-white/60">
              {veredito.usos} uso(s) registrado(s)
              {veredito.ultimo_uso && ` · último em ${new Date(`${veredito.ultimo_uso}T12:00:00`).toLocaleDateString("pt-BR")}`}
            </p>
          )}
        </div>
      )}

      {liberado && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
            inputMode="tel"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            {TIPOS_DAYUSE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <CurrencyInputBRL value={valor} onChange={setValor} />
            </div>
            {valor > 0 && (
              <select
                value={forma}
                onChange={(e) => setForma(e.target.value as FormaPagamento)}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 text-sm text-white"
              >
                {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            )}
          </div>
          <p className="text-[11px] text-white/50">
            Deixe o valor em zero para entrada gratuita.
          </p>

          <button
            type="button"
            onClick={() => void gravar()}
            disabled={salvando || nome.trim().length < 3}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
            Liberar e registrar
          </button>
        </div>
      )}
    </div>
  );
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

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

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-3">
      {dados.facesPendentes.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-[11px] font-bold text-red-400">
            {dados.facesPendentes.length} rosto(s) para apagar do leitor
          </p>
          <p className="mt-0.5 text-[11px] text-white/60">
            O prazo venceu. Enquanto o agente da academia não existir, isso é
            tarefa manual — apagar no próprio iDFace.
          </p>
          <div className="mt-1.5 space-y-0.5">
            {dados.facesPendentes.slice(0, 6).map((f) => (
              <p key={f.inscricao_id} className="text-[11px] text-white/70">
                <strong className="text-white">{f.nome}</strong> — {f.evento}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white">Novo evento</p>
        <input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Aulão de funcional)"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <div className="flex gap-2">
          <input
            type="date" value={dataEv} onChange={(e) => setDataEv(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
          />
          <div className="min-w-0 flex-1"><CurrencyInputBRL value={valorEv} onChange={setValorEv} /></div>
        </div>
        <select
          value={acesso} onChange={(e) => setAcesso(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        >
          {OPCOES_ACESSO_EVENTO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {acesso !== "qrcode" && (
          <>
            <select
              value={facePol} onChange={(e) => setFacePol(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
            >
              {OPCOES_FACE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-[11px] text-amber-400">
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
          className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
        >
          Criar evento
        </button>
      </div>

      {dados.eventos.length > 0 && (
        <>
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[11px] font-bold text-white">Inscrever participante</p>
            <select
              value={inscEvento} onChange={(e) => setInscEvento(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <input
              value={inscCpf} onChange={(e) => setInscCpf(e.target.value)}
              placeholder="CPF (opcional)" inputMode="numeric"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
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
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              Inscrever
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[11px] font-bold text-white">Validar entrada</p>
            <div className="flex gap-2">
              <input
                value={credencial} onChange={(e) => { setCredencial(e.target.value); setVeredito(null); }}
                placeholder="Credencial do participante"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
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
                className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                Validar
              </button>
            </div>
            {veredito && (
              <div className={`rounded-xl border p-2.5 ${veredito.decisao === "liberado" ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                <p className={`text-sm font-bold ${veredito.decisao === "liberado" ? "text-green-400" : "text-red-400"}`}>
                  {MOTIVO_EVENTO[veredito.motivo] ?? veredito.motivo}
                </p>
                {veredito.nome && <p className="text-[11px] text-white/60">{veredito.nome}</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {dados.eventos.map((e) => {
              const insc = dados.inscricoes.filter((i) => i.evento_id === e.id);
              const usados = insc.filter((i) => i.usado_em).length;
              return (
                <div key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="font-semibold text-white">{e.nome}</p>
                  <p className="text-[11px] text-white/50">
                    {new Date(`${e.data_evento}T12:00:00`).toLocaleDateString("pt-BR")}
                    {e.valor > 0 && ` · ${brl(Number(e.valor))}`}
                    {" · "}{insc.length} inscrito(s), {usados} entrou(entraram)
                  </p>
                </div>
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

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;
  const c = dados.config;

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white">Como esta academia conta</p>

        <select
          value={c.validacao_frequencia}
          onChange={(e) => void gravarCfg({ validacao: e.target.value })}
          disabled={salvando}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        >
          {OPCOES_VALIDACAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={c.frequencia_conta}
          onChange={(e) => void gravarCfg({ conta: e.target.value })}
          disabled={salvando}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        >
          {OPCOES_CONTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={c.frequencia_periodo}
          onChange={(e) => void gravarCfg({ periodo: e.target.value })}
          disabled={salvando}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        >
          {OPCOES_PERIODO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <input
          type="number"
          min={0}
          value={c.frequencia_meta ?? ""}
          onChange={(e) => void gravarCfg({ meta: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="Meta de aulas para premiação (ex.: 100)"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <p className="text-[11px] text-white/50">
          Toda entrada é sempre registrada, inclusive a segunda do mesmo dia. A
          configuração decide o que <strong className="text-white/70">conta</strong>, não o que é guardado.
        </p>
      </div>

      <div className="flex gap-2">
        <select
          value={turmaId}
          onChange={(e) => setTurmaId(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        >
          <option value="">Todas as turmas</option>
          {dados.turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
        />
      </div>

      <div className="flex gap-2">
        <input
          value={novaTurma}
          onChange={(e) => setNovaTurma(e.target.value)}
          placeholder="Nova turma (ex.: Bike Indoor 19h)"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await criarTurma({ data: { partnerId, nome: novaTurma } });
              setNovaTurma(""); carregar();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
          }}
          disabled={novaTurma.trim().length < 2}
          className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
        >
          Criar
        </button>
      </div>

      {dados.linhas.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">
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
              <div key={l.student_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{l.nome}</p>
                    <p className="text-[11px] text-white/50">
                      {contagem} {c.frequencia_conta === "dia" ? "dia(s)" : "entrada(s)"}
                      {l.minutos_medios > 0 && ` · ${l.minutos_medios} min em média`}
                      {l.ultima && ` · última em ${new Date(l.ultima).toLocaleDateString("pt-BR")}`}
                    </p>
                    {l.repetiu_hoje && (
                      <p className="text-[11px] text-amber-400">Entrou mais de uma vez hoje</p>
                    )}
                  </div>
                  {meta > 0 && (
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${bateu ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/60"}`}>
                      {contagem}/{meta}
                    </span>
                  )}
                </div>
              </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#12171C] p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">Treinos de {nomeAluno}</p>
            {coach && (
              <p className="text-[11px] text-white/50">
                Aluno de <strong className="text-white/80">{coach}</strong> — o vínculo e a comissão não mudam.
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-white/60 hover:bg-white/10">✕</button>
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-primary" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] font-bold text-white">Aplicar um treino pronto</p>
              <select
                value={modeloId}
                onChange={(e) => setModeloId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
              >
                <option value="">Escolha um modelo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.level ? ` · ${m.level}` : ""}</option>
                ))}
              </select>
              <select
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
              >
                <option value="">Sem dia fixo</option>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <button
                type="button"
                onClick={() => void criar()}
                disabled={salvando || !modeloId}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dumbbell className="h-4 w-4" />}
                Criar treino
              </button>
              {modelos.length === 0 && (
                <p className="text-[11px] text-white/50">
                  Nenhum modelo global cadastrado ainda. Os modelos vêm da biblioteca de treinos prontos.
                </p>
              )}
            </div>

            {planos.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/50">Este aluno ainda não tem treino.</p>
            ) : (
              <div className="space-y-2">
                {planos.map((p) => (
                  <div key={p.plano_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{p.nome}</p>
                        <p className="text-[11px] text-white/50">
                          {p.exercicios} exercício(s)
                          {p.dia_semana != null && ` · ${DIAS[p.dia_semana]}`}
                        </p>
                        <p className="text-[11px] text-white/50">
                          Montado por <strong className="text-white/80">{p.montado_por_nome}</strong>
                        </p>
                      </div>
                      {!p.ativo && (
                        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/60">Inativo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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

  if (loading || !dados) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] text-white/60">
          Nada de loja, checkout ou produto é criado aqui — tudo isso já existe.
          Isto só diz <strong className="text-white/80">quais produtos liberam mensalidade</strong> nesta
          academia quando a compra é confirmada.
        </p>
        <p className="mt-1.5 text-[11px] text-white/60">
          A liberação exige o pagamento aprovado pelo gateway configurado, não só
          o pedido criado.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] font-bold text-white">Vincular um produto</p>
        {novo ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="truncate text-sm text-white">{novo.name}</span>
              <button type="button" onClick={() => setNovo(null)} className="shrink-0 text-white/50 hover:text-white">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="number" min={1} value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                placeholder="Dias"
                className="w-24 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
              <select
                value={politica} onChange={(e) => setPolitica(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
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
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
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
                    {dados.nomes[v.product_id] ?? v.plano}
                  </p>
                  <p className="text-[11px] text-white/50">
                    {v.dias_validade} dia(s) ·{" "}
                    {POLITICAS_RENOVACAO.find((p) => p.value === v.politica_renovacao)?.label ?? v.politica_renovacao}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/60">
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
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Ativo
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={async () => {
          try {
            const r = await reprocessar({ data: { partnerId } });
            toast.success(r.geradas > 0
              ? `${r.geradas} mensalidade(s) gerada(s) de compras que ficaram para trás.`
              : "Nenhuma compra pendente — está tudo liberado.");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
        }}
        className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"
      >
        Procurar compras pagas sem mensalidade
      </button>
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

  return (
    <div className="space-y-3">
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
    </div>
  );
}

function ModelosAviso({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterModelosAviso);
  const salvar = useServerFn(salvarModelosAviso);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [automatico, setAutomatico] = useState(false);
  const [modelos, setModelos] = useState<Array<{ marco: string; texto: string; ativo: boolean }>>([]);

  useEffect(() => {
    setLoading(true);
    obter({ data: { partnerId } })
      .then((r) => {
        setAutomatico(r.automatico);
        setModelos(r.modelos.map((m) => ({ marco: m.marco, texto: m.texto, ativo: m.ativo })));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [partnerId]);

  const gravar = async () => {
    setSalvando(true);
    try {
      await salvar({ data: { partnerId, automatico, modelos } });
      toast.success("Mensagens salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-primary" />;

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
          Mesmo ligado, nada é enviado sozinho: as campanhas aparecem prontas na
          aba Robô e alguém precisa disparar.
        </span>
      </label>

      {modelos.map((m, i) => (
        <div key={m.marco} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white">{ROTULO_MARCO[m.marco] ?? m.marco}</span>
            <label className="flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={m.ativo}
                onChange={(e) => setModelos((a) => a.map((x, j) => j === i ? { ...x, ativo: e.target.checked } : x))}
                className="h-3.5 w-3.5 accent-primary"
              />
              Ativo
            </label>
          </div>
          <textarea
            value={m.texto}
            onChange={(e) => setModelos((a) => a.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))}
            rows={2}
            className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/40"
          />
        </div>
      ))}

      <p className="text-[11px] text-white/50">
        <code className="rounded bg-white/10 px-1">{"{nome}"}</code> vira o primeiro nome de quem recebe.{" "}
        <code className="rounded bg-white/10 px-1">{"{data}"}</code> vira a data de vencimento.
      </p>

      <button
        type="button"
        onClick={() => void gravar()}
        disabled={salvando}
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
  const [loading, setLoading] = useState(true);
  const [preparando, setPreparando] = useState(false);
  const [dados, setDados] = useState<{
    comTelefone: Array<{ student_id: string; nome: string; telefone: string | null; marco: string; valido_ate: string }>;
    semTelefone: Array<{ student_id: string; nome: string; marco: string }>;
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
            <div key={`${a.student_id}-${a.marco}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{a.nome}</p>
                <p className="text-[11px] text-white/50">{a.telefone}</p>
              </div>
              <span className="shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                {ROTULO_MARCO[a.marco] ?? a.marco}
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
  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Array<{
    id: string; student_id: string; nome: string; plano: string; valido_ate: string;
    dias_restantes: number | null; decisao: string; motivo: string; valor: number;
  }>>([]);
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
                    <button
                      type="button"
                      onClick={() => setFichaId(l.student_id)}
                      className="flex items-center gap-1.5 text-left font-semibold text-white hover:text-primary"
                    >
                      <span className="truncate">{l.nome}</span>
                      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </button>
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTreinoDe({ id: l.student_id, nome: l.nome })}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Dumbbell className="h-3 w-3" /> Treino
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAbertoId(l.id); setMotivo(""); setTipoCancel("cancelada"); }}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Ban className="h-3 w-3" /> Cancelar
                        </button>
                      </div>
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
