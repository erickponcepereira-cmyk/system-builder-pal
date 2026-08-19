import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  QrCode, ScanLine, Loader2, CheckCircle2, Clock, AlertCircle,
  Phone, UserRound, History, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { QRScannerModal } from "@/components/QRScannerModal";

/**
 * Scanner de presença do parceiro.
 *
 * A lista vem de `partner_freebie_do_dia`, e não de um SELECT direto na tabela.
 * Duas razões: quem está na recepção precisa de nome, telefone e coach
 * responsável — dados que exigem quatro junções e ficariam presos em RLS — e a
 * mesma função já checa `scanner.usar`, a permissão que o resgate passou a
 * respeitar.
 */

type Reserva = {
  reservation_id: string;
  status: string;
  slot_start: string;
  slot_end: string;
  produto: string | null;
  aluno_nome: string | null;
  aluno_telefone: string | null;
  aluno_foto: string | null;
  coach_nome: string | null;
  coach_telefone: string | null;
  visitas_aqui: number;
  visitas_no_mes: number;
};

type ResumoProduto = {
  produto_id: string;
  produto: string;
  limite_mensal: number | null;
  usados: number;
  restantes: number | null;
  reservas: number;
  visitantes: number;
  faltas: number;
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** 65999990001 -> (65) 99999-0001, sem quebrar o que não for telefone. */
function telefoneBonito(t: string | null): string | null {
  const d = (t || "").replace(/\D/g, "");
  if (d.length < 10) return t || null;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

function estadoDaReserva(r: Reserva, agora: number) {
  const ini = new Date(r.slot_start).getTime();
  const fim = new Date(r.slot_end).getTime();
  if (r.status === "used") return { label: "Confirmado", tone: "text-green-400" };
  if (r.status === "cancelled") return { label: "Cancelado", tone: "text-white/40" };
  if (r.status === "expired" || agora > fim) return { label: "Expirado", tone: "text-red-400" };
  if (agora < ini) return { label: "Aguardando", tone: "text-amber-400" };
  return { label: "Disponível agora", tone: "text-primary" };
}

export function PartnerFreebieScanner({ partnerId }: { partnerId: string }) {
  const [open, setOpen] = useState(false);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [resumo, setResumo] = useState<ResumoProduto[]>([]);
  const [verHistorico, setVerHistorico] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = async () => {
    setLoading(true);
    const [dia, mes] = await Promise.all([
      supabase.rpc("partner_freebie_do_dia" as never, { p_partner_id: partnerId } as never),
      supabase.rpc("partner_freebie_resumo_mensal" as never, { p_partner_id: partnerId } as never),
    ]);
    if (dia.error) toast.error(dia.error.message);
    setReservas(((dia.data as unknown) as Reserva[]) || []);
    setResumo(((mes.data as unknown) as ResumoProduto[]) || []);
    setLoading(false);
  };

  useEffect(() => { void carregar(); }, [partnerId]);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const aoLer = async (decoded: string) => {
    setOpen(false);
    if (processing) return;
    setProcessing(true);
    // Aceita o token cru ou a URL inteira terminando em /freebie/<token>
    const token = decoded.includes("/freebie/")
      ? decoded.split("/freebie/").pop()!.split(/[?#]/)[0]
      : decoded.trim();
    const { data, error } = await supabase.rpc("redeem_partner_freebie" as never, { _qr_token: token } as never);
    setProcessing(false);
    if (error) { toast.error(error.message.replace(/^Error:\s*/i, "")); void carregar(); return; }
    const r = (data as unknown as Array<{ student_name: string; product_name: string; slot_start: string }>)?.[0];
    if (r) toast.success(`Check-in: ${r.student_name} — ${r.product_name} ${fmtTime(r.slot_start)}`);
    void carregar();
  };

  const contagem = {
    reservadas: reservas.filter((r) => r.status !== "cancelled").length,
    agora: reservas.filter(
      (r) => r.status === "reserved"
        && agora >= new Date(r.slot_start).getTime()
        && agora <= new Date(r.slot_end).getTime(),
    ).length,
    confirmadas: reservas.filter((r) => r.status === "used").length,
  };

  const mes = resumo.reduce(
    (a, p) => ({
      visitantes: a.visitantes + (p.visitantes || 0),
      usados: a.usados + (p.usados || 0),
      // Só soma vaga de produto que tem limite: misturar com "sem limite"
      // daria um número que a recepção leria como se fosse o total.
      restantes: p.restantes == null ? a.restantes : (a.restantes ?? 0) + p.restantes,
      temLimite: a.temLimite || p.limite_mensal != null,
    }),
    { visitantes: 0, usados: 0, restantes: null as number | null, temLimite: false },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" /> Scanner de presença
        </h2>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          <ScanLine className="h-4 w-4" /> Ler QR
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] text-white/50 uppercase">Reservas hoje</p>
          <p className="text-xl font-bold text-white mt-0.5">{contagem.reservadas}</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] text-white/50 uppercase">Disponíveis agora</p>
          <p className="text-xl font-bold text-primary mt-0.5">{contagem.agora}</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] text-white/50 uppercase">Presenças confirmadas</p>
          <p className="text-xl font-bold text-green-400 mt-0.5">{contagem.confirmadas}</p>
        </div>
      </div>

      {/* Histórico do mês */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <button
          onClick={() => setVerHistorico((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 border-b border-white/5 text-left"
        >
          <History className="h-3.5 w-3.5 text-white/50" />
          <p className="text-xs font-bold text-white flex-1">Este mês</p>
          <span className="text-[10px] text-white/50">
            {mes.visitantes} visitante{mes.visitantes === 1 ? "" : "s"} · {mes.usados} presença{mes.usados === 1 ? "" : "s"}
            {mes.temLimite && mes.restantes != null && ` · ${mes.restantes} vaga${mes.restantes === 1 ? "" : "s"}`}
          </span>
          {verHistorico ? <ChevronUp className="h-3.5 w-3.5 text-white/40" /> : <ChevronDown className="h-3.5 w-3.5 text-white/40" />}
        </button>

        {verHistorico && (
          resumo.length === 0 ? (
            <p className="p-4 text-center text-xs text-white/40">Nenhum benefício gratuito cadastrado.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {resumo.map((p) => (
                <div key={p.produto_id} className="px-3 py-2.5">
                  <p className="text-xs font-bold text-white truncate">{p.produto}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/50">
                    <span>{p.visitantes} visitante{p.visitantes === 1 ? "" : "s"}</span>
                    <span>{p.usados} presença{p.usados === 1 ? "" : "s"}</span>
                    <span>{p.reservas} reserva{p.reservas === 1 ? "" : "s"}</span>
                    {p.faltas > 0 && <span className="text-amber-400/70">{p.faltas} não apareceu</span>}
                    <span className={p.restantes === 0 ? "text-red-400" : ""}>
                      {p.limite_mensal == null
                        ? "sem limite de vagas"
                        : `${p.restantes} de ${p.limite_mensal} vaga${p.limite_mensal === 1 ? "" : "s"} livre${p.restantes === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-xs font-bold text-white">Reservas de hoje</p>
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : reservas.length === 0 ? (
          <p className="p-6 text-center text-xs text-white/40">Nenhuma reserva para hoje.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {reservas.map((r) => {
              const est = estadoDaReserva(r, agora);
              const tel = telefoneBonito(r.aluno_telefone);
              const telCoach = telefoneBonito(r.coach_telefone);
              return (
                <div key={r.reservation_id} className="p-3">
                  <div className="flex items-start gap-2">
                    {r.aluno_foto ? (
                      <img src={r.aluno_foto} className="h-9 w-9 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/60">
                        {(r.aluno_nome || "?")[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{r.aluno_nome || "Aluno"}</p>
                      <p className="text-[10px] text-white/50 truncate">{r.produto}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-white/60 flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" /> {fmtTime(r.slot_start)}–{fmtTime(r.slot_end)}
                      </p>
                      {r.status === "used" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-bold">
                          <CheckCircle2 className="h-3 w-3" /> Confirmado
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${est.tone}`}>
                          {est.label === "Expirado" && <AlertCircle className="h-3 w-3" />}
                          {est.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quem receber a pessoa precisa disto na mão, não numa outra tela. */}
                  <div className="mt-2 ml-11 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    {tel && (
                      <a href={`https://wa.me/55${(r.aluno_telefone || "").replace(/\D/g, "")}`}
                         target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-1 text-white/60 hover:text-primary">
                        <Phone className="h-3 w-3" /> {tel}
                      </a>
                    )}
                    {r.coach_nome && (
                      <span className="inline-flex items-center gap-1 text-white/50">
                        <UserRound className="h-3 w-3" /> Coach {r.coach_nome}
                        {telCoach && <span className="text-white/30">· {telCoach}</span>}
                      </span>
                    )}
                    <span className="text-white/40">
                      {r.visitas_aqui === 0
                        ? "primeira vez aqui"
                        : `${r.visitas_aqui}ª visita · ${r.visitas_no_mes} este mês`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && <QRScannerModal onClose={() => setOpen(false)} onScan={aoLer} title="Ler QR do aluno" />}
    </div>
  );
}
