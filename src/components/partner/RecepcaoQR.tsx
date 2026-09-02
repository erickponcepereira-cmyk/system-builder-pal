import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QrCode, Loader2, Check, X, Users, ChevronLeft, ChevronRight, Ban, Search } from "lucide-react";
import { QRScannerModal } from "@/components/QRScannerModal";
import {
  reservasDoDia, validarQr, fecharFaltas, cancelarReserva, definirCapacidade,
  buscarNaRecepcao, registrarEntradaRecepcao, academiaTemGrade,
  type AulaDoDia, type LeituraDoQr, type PessoaNaRecepcao,
} from "@/lib/academia-reservas.functions";
import {
  BOTAO_ACAO, BOTAO_NEUTRO, BOTAO_TEXTO, CAMPO, CAMPO_MINI,
  Bloco, EYEBROW, FOCO, Pilula,
} from "@/components/partner/VisualAcademia";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");
const diaBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** O motivo do banco em palavras que a recepção usa. */
const EM_PORTUGUES: Record<string, string> = {
  contrato_ativo: "Em dia",
  vencimento_proximo: "Vence em breve",
  em_carencia: "Em carência",
  vencido_bloqueado: "Mensalidade vencida",
  sem_mensalidade: "Sem mensalidade",
};

export function RecepcaoQR({ partnerId }: { partnerId: string }) {
  const pedirDia = useServerFn(reservasDoDia);
  const validar = useServerFn(validarQr);
  const fechar = useServerFn(fecharFaltas);
  const cancelar = useServerFn(cancelarReserva);
  const capacidade = useServerFn(definirCapacidade);
  const buscar = useServerFn(buscarNaRecepcao);
  const registrarEntrada = useServerFn(registrarEntradaRecepcao);
  const temGradeFn = useServerFn(academiaTemGrade);

  const hoje = new Date().toISOString().slice(0, 10);
  const [dia, setDia] = useState(hoje);
  const [aulas, setAulas] = useState<AulaDoDia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [ultima, setUltima] = useState<LeituraDoQr | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<PessoaNaRecepcao[]>([]);
  const [registrando, setRegistrando] = useState<string | null>(null);
  // Academia sem grade não vê agenda: numa academia de treino livre o bloco
  // repetiria "cadastre a grade" para sempre, ocupando meia tela de celular.
  const [temGrade, setTemGrade] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    pedirDia({ data: { partnerId, data: dia } })
      .then((r) => setAulas(r as AulaDoDia[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para carregar o dia"))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, dia]);

  useEffect(carregar, [carregar]);

  const conferir = useCallback(
    (token: string) => {
      const limpo = token.trim();
      if (!limpo) return;
      setConferindo(true);
      validar({ data: { partnerId, token: limpo } })
        .then((r) => {
          const leitura = r as LeituraDoQr;
          setUltima(leitura);
          setCodigo("");
          if (leitura.liberado) {
            toast.success(`${leitura.nome} pode entrar`);
            carregar();
          } else {
            toast.error(leitura.erro ?? `${leitura.nome ?? "Pessoa"}: ${EM_PORTUGUES[leitura.motivo ?? ""] ?? "sem acesso"}`);
          }
        })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para ler"))
        .finally(() => setConferindo(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partnerId, carregar],
  );

  /*
   * A busca existe porque o QR só serve a quem já tem conta e credencial
   * ligada. No Reino isso ainda é minoria, e sem catraca a recepção precisa de
   * alguma forma de responder "esta pessoa está em dia?".
   */
  const procurar = useCallback(
    (t: string) => {
      if (t.trim().length < 3) { setAchados([]); return; }
      buscar({ data: { partnerId, termo: t } })
        .then((r) => setAchados(r as PessoaNaRecepcao[]))
        .catch(() => setAchados([]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partnerId],
  );

  useEffect(() => {
    const t = setTimeout(() => procurar(termo), 350);
    return () => clearTimeout(t);
  }, [termo, procurar]);

  useEffect(() => {
    temGradeFn({ data: { partnerId } })
      .then((r) => setTemGrade(r as boolean))
      .catch(() => setTemGrade(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const registrar = async (p: PessoaNaRecepcao) => {
    // Quem está devendo entra, mas ninguém libera sem ver o que está fazendo.
    if (!p.liberado) {
      const situacao = (EM_PORTUGUES[p.motivo] ?? p.motivo).toLowerCase();
      const certeza = window.confirm(
        `${p.nome} está com ${situacao}.\n\nRegistrar a entrada assim mesmo?\n\nFica gravado que a recepção liberou, e a entrada conta na frequência.`,
      );
      if (!certeza) return;
    }
    setRegistrando(p.credencial_id);
    try {
      const leitura = (await registrarEntrada({
        data: { partnerId, credencialId: p.credencial_id },
      })) as LeituraDoQr;
      if (leitura.repetido) {
        toast.info(`${leitura.nome} já tinha sido registrado nos últimos 5 minutos.`);
      } else if (leitura.liberado) {
        toast.success(`Entrada de ${leitura.nome} registrada.`);
      } else {
        toast.warning(`Entrada de ${leitura.nome} registrada — estava devendo.`);
      }
      procurar(termo);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para registrar");
    } finally {
      setRegistrando(null);
    }
  };

  const andarDia = (passo: number) => {
    const d = new Date(`${dia}T12:00:00`);
    d.setDate(d.getDate() + passo);
    setDia(d.toISOString().slice(0, 10));
  };

  const totalReservado = aulas.reduce((s, a) => s + a.reservados, 0);
  const totalPresente = aulas.reduce((s, a) => s + a.presentes, 0);

  return (
    <div className="space-y-4">
      {/* ---------- ler o QR ---------- */}
      <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
        <div className={`mb-3 ${EYEBROW}`}>Entrada pelo QR</div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setLendo(true)} className={`${BOTAO_ACAO} sm:w-auto`}>
            <QrCode className="h-4 w-4" /> Ler o QR do aluno
          </button>

          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => { e.preventDefault(); conferir(codigo); }}
          >
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ou digite o código, se a câmera falhar"
              className={`${CAMPO} flex-1`}
            />
            <button type="submit" disabled={conferindo || !codigo.trim()} className={BOTAO_NEUTRO}>
              {conferindo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conferir"}
            </button>
          </form>
        </div>

        {ultima && (
          <Bloco tom={ultima.liberado ? "ok" : "critico"} className="mt-3">
            <div className="flex items-start gap-3">
              {ultima.liberado
                ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-aca-ok" />
                : <X className="mt-0.5 h-5 w-5 shrink-0 text-aca-critico" />}
              <div className="min-w-0">
                <div className="text-base font-bold text-aca-ink">
                  {ultima.nome ?? "Código não reconhecido"}
                </div>
                <div className="text-sm text-aca-muted">
                  {ultima.erro ?? EM_PORTUGUES[ultima.motivo ?? ""] ?? ultima.motivo}
                  {ultima.valido_ate && ` · vence ${diaBR(ultima.valido_ate)}`}
                  {typeof ultima.dias_restantes === "number" && ultima.dias_restantes >= 0
                    && ` · ${ultima.dias_restantes} dia(s)`}
                </div>
                {ultima.repetido && (
                  <div className="mt-1 text-[12px] text-aca-fraco">
                    Já tinha sido lido nos últimos 5 minutos — não contei a entrada de novo.
                  </div>
                )}
                {ultima.reserva_marcada && (
                  <div className="mt-1 text-[12px] text-aca-ok">Presença marcada na aula reservada.</div>
                )}
              </div>
            </div>
          </Bloco>
        )}
      </div>

      {/* ---------- achar sem o QR ---------- */}
      <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
        <div className={`mb-1 ${EYEBROW}`}>Sem o QR</div>
        <p className="mb-3 text-[12px] text-aca-muted">
          Quem ainda não tem o aplicativo. Ache pelo nome ou pelo CPF.
        </p>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aca-muted" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="nome ou CPF"
            className={`${CAMPO} w-full pl-9`}
          />
        </div>

        {termo.trim().length >= 3 && achados.length === 0 && (
          <p className="mt-3 text-sm text-aca-muted">Ninguém com esse nome ou CPF nesta academia.</p>
        )}

        <div className="mt-3 space-y-2">
          {achados.map((p) => (
            <div key={p.credencial_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-aca-line bg-aca-alto p-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-aca-ink">{p.nome}</div>
                <div className={`text-[12px] ${p.liberado ? "text-aca-muted" : "text-aca-critico"}`}>
                  {EM_PORTUGUES[p.motivo] ?? p.motivo}
                  {p.valido_ate && ` · vence ${diaBR(p.valido_ate)}`}
                </div>
              </div>
              {p.entrou_hoje ? (
                <Pilula>já entrou hoje</Pilula>
              ) : (
                <button
                  type="button"
                  disabled={registrando === p.credencial_id}
                  onClick={() => void registrar(p)}
                  className={`shrink-0 ${p.liberado ? BOTAO_ACAO : BOTAO_NEUTRO}`}
                >
                  {registrando === p.credencial_id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : p.liberado ? "Registrar entrada" : "Entrar assim mesmo"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- o dia ---------- */}
      {temGrade && (
      <div className="rounded-xl border border-aca-line bg-aca-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => andarDia(-1)}
            className={`rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO}`}
            aria-label="Dia anterior">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
              className={`${CAMPO_MINI} text-center`} />
            <div className="mt-1 text-[11px] text-aca-muted tabular-nums">
              {totalPresente} de {totalReservado} reservados já entraram
            </div>
          </div>
          <button type="button" onClick={() => andarDia(1)}
            className={`rounded-lg p-1.5 text-aca-muted hover:bg-aca-alto hover:text-aca-ink ${FOCO}`}
            aria-label="Próximo dia">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      )}

      {!temGrade ? null : carregando ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-aca-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando as aulas...
        </div>
      ) : aulas.length === 0 ? (
        <Bloco className="text-center text-sm text-aca-muted">
          Nenhuma aula cadastrada para este dia da semana. Cadastre a grade na aba Frequência.
        </Bloco>
      ) : (
        <div className="space-y-2">
          {aulas.map((a) => (
            <AulaCard
              key={a.turma_id}
              aula={a}
              aoCancelar={async (reservaId) => {
                const r = await cancelar({ data: { partnerId, reservaId } });
                if (!r.ok) { toast.error(r.erro ?? "Não deu para cancelar"); return; }
                toast.success("Reserva cancelada.");
                carregar();
              }}
              aoDefinirCapacidade={async (valor) => {
                await capacidade({ data: { partnerId, turmaId: a.turma_id, capacidade: valor } });
                toast.success(valor === null ? "Sem limite de vagas." : `Limite: ${valor} vagas.`);
                carregar();
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className={BOTAO_NEUTRO}
        onClick={() => {
          fechar({ data: { partnerId, ate: dia } })
            .then((r) => { toast.success(`${r.faltas_marcadas} falta(s) registrada(s).`); carregar(); })
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu"));
        }}
      >
        <Ban className="h-4 w-4" /> Marcar falta de quem reservou e não veio
      </button>
      <p className="text-[11px] text-aca-fraco">
        Só marca aulas que já terminaram — quem chegou atrasado não vira falta.
      </p>

      {lendo && (
        <QRScannerModal
          title="QR da mensalidade"
          onClose={() => setLendo(false)}
          onScan={(lido) => { setLendo(false); conferir(lido); }}
        />
      )}
    </div>
  );
}

function AulaCard({ aula, aoCancelar, aoDefinirCapacidade }: {
  aula: AulaDoDia;
  aoCancelar: (reservaId: string) => Promise<void>;
  aoDefinirCapacidade: (valor: number | null) => Promise<void>;
}) {
  const [aberta, setAberta] = useState(false);
  const [editandoVagas, setEditandoVagas] = useState(false);
  const [vagas, setVagas] = useState(aula.capacidade?.toString() ?? "");

  const lotada = aula.capacidade !== null && aula.reservados >= aula.capacidade;

  return (
    <div className="overflow-hidden rounded-xl border border-aca-line bg-aca-surface">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className={`flex w-full items-center gap-3 p-3 text-left hover:bg-aca-alto ${FOCO}`}
      >
        <span aria-hidden className={`h-9 w-[3px] shrink-0 rounded-full ${
          aula.presentes > 0 ? "bg-aca-ok" : lotada ? "bg-aca-atencao" : "bg-aca-neutro"
        }`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-aca-ink tabular-nums">
            {hhmm(aula.hora_inicio)}–{hhmm(aula.hora_fim)} · {aula.turma}
          </div>
          <div className="text-[11px] text-aca-muted">
            {aula.reservados} reservado(s)
            {aula.capacidade !== null && ` de ${aula.capacidade}`}
            {aula.presentes > 0 && ` · ${aula.presentes} presente(s)`}
            {aula.faltas > 0 && ` · ${aula.faltas} falta(s)`}
          </div>
        </div>
        <Users className="h-4 w-4 shrink-0 text-aca-muted" />
      </button>

      {aberta && (
        <div className="space-y-2 border-t border-aca-line p-3">
          <div className="flex items-center gap-2">
            {editandoVagas ? (
              <>
                <input value={vagas} onChange={(e) => setVagas(e.target.value)} inputMode="numeric"
                  placeholder="sem limite" className={`${CAMPO_MINI} w-28`} />
                <button type="button" className={BOTAO_TEXTO}
                  onClick={() => {
                    const n = vagas.trim() === "" ? null : Number(vagas);
                    if (n !== null && (!Number.isInteger(n) || n < 1)) return toast.error("Use um número inteiro maior que zero");
                    aoDefinirCapacidade(n).then(() => setEditandoVagas(false));
                  }}>
                  salvar
                </button>
                <button type="button" className={`${BOTAO_TEXTO} !text-aca-muted`}
                  onClick={() => setEditandoVagas(false)}>cancelar</button>
              </>
            ) : (
              <button type="button" className={BOTAO_TEXTO} onClick={() => setEditandoVagas(true)}>
                {aula.capacidade === null ? "definir limite de vagas" : `limite: ${aula.capacidade} vagas — mudar`}
              </button>
            )}
          </div>

          {aula.pessoas.length === 0 ? (
            <p className="text-sm text-aca-muted">Ninguém reservou esta aula.</p>
          ) : (
            <div className="divide-y divide-aca-line">
              {aula.pessoas.map((p) => (
                <div key={p.reserva_id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-aca-ink">{p.nome}</div>
                    {p.telefone && <div className="text-[11px] text-aca-muted">{p.telefone}</div>}
                  </div>
                  {p.status === "presente" && <Pilula tom="ok">veio</Pilula>}
                  {p.status === "faltou" && <Pilula tom="critico">faltou</Pilula>}
                  {p.status === "reservada" && (
                    <>
                      <Pilula tom="atencao">esperando</Pilula>
                      <button type="button" className={`${BOTAO_TEXTO} !text-aca-muted`}
                        onClick={() => aoCancelar(p.reserva_id)}>
                        cancelar
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecepcaoQR;
