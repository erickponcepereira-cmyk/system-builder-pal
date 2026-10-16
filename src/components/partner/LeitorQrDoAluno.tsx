import { useRef, useState } from "react";
import { Loader2, ScanLine, Check, X, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QRScannerModal } from "@/components/QRScannerModal";
import { classificarQrDoAluno, QR_ACEITOS } from "@/lib/qr-do-aluno";

/**
 * Leitor único do balcão do parceiro. Entende os três QRs que o aluno mostra
 * (carteirinha, cupom, reserva) — as abas "Scanner" e "QR" só montam este
 * componente; a regra "QR lido -> chamada -> tela de confirmação" mora aqui.
 */

interface AlunoPreview {
  student_id: string; student_name: string; student_avatar: string | null;
  student_email: string | null; student_city: string | null; student_state: string | null;
}
interface CupomPreview {
  coupon_id: string; status: string; student_name: string; student_photo: string | null;
  product_name: string; created_at: string; redeemed_at: string | null;
  benefit_start_time: string | null; benefit_end_time: string | null;
}
interface ReservaResgatada { student_name: string; product_name: string; slot_start: string }
interface VisitaRegistrada { student_name?: string; student_avatar?: string | null; visited_at?: string }

type Etapa =
  | { fase: "ocioso" }
  | { fase: "processando" }
  | { fase: "aluno"; preview: AlunoPreview }
  | { fase: "cupom"; preview: CupomPreview; token: string }
  | { fase: "feito"; nome: string; avatar: string | null; mensagem: string; quando: string }
  | { fase: "erro"; mensagem: string };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const limparErro = (m: string) => m.replace(/^Error:\s*/i, "");

function janelaDoBeneficio(inicio: string | null, fim: string | null): string | null {
  const s = inicio?.slice(0, 5);
  const e = fim?.slice(0, 5);
  if (s && e) return `Disponível das ${s} às ${e}`;
  if (s) return `Disponível a partir das ${s}`;
  if (e) return `Disponível até ${e}`;
  return null;
}

function Foto({ url, nome, tamanho }: { url: string | null; nome: string; tamanho: string }) {
  if (url) return <img src={url} alt={nome} className={`mx-auto ${tamanho} rounded-full object-cover border-4 border-primary/30`} />;
  return (
    <div className={`mx-auto ${tamanho} rounded-full bg-primary/15 flex items-center justify-center text-3xl font-bold text-primary`}>
      {nome.charAt(0)}
    </div>
  );
}

function BotoesDeConfirmacao({ rotulo, aoCancelar, aoConfirmar }: { rotulo: string; aoCancelar: () => void; aoConfirmar: () => void }) {
  return (
    <div className="mt-4 flex gap-2 max-w-xs mx-auto">
      <button onClick={aoCancelar} className="flex-1 rounded bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
        <X className="inline h-4 w-4 mr-1" /> Cancelar
      </button>
      <button onClick={aoConfirmar} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
        <Check className="inline h-4 w-4 mr-1" /> {rotulo}
      </button>
    </div>
  );
}

export function LeitorQrDoAluno({ partnerId, onConcluido }: { partnerId: string; onConcluido?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>({ fase: "ocioso" });
  const ocupado = useRef(false);

  const falhar = (mensagem: string) => {
    const texto = limparErro(mensagem);
    toast.error(texto);
    setEtapa({ fase: "erro", mensagem: texto });
  };

  const reiniciar = () => { setEtapa({ fase: "ocioso" }); setAberto(true); };
  const fechar = () => setEtapa({ fase: "ocioso" });

  const resgatarReserva = async (token: string) => {
    const { data, error } = await supabase.rpc("redeem_partner_freebie" as never, { _qr_token: token } as never);
    if (error) return falhar(error.message);
    const r = (data as unknown as ReservaResgatada[] | null)?.[0];
    if (!r) return falhar("Reserva não encontrada.");
    toast.success(`Check-in: ${r.student_name} — ${r.product_name} ${hora(r.slot_start)}`);
    setEtapa({ fase: "feito", nome: r.student_name, avatar: null, mensagem: `Presença confirmada — ${r.product_name} ${hora(r.slot_start)}`, quando: new Date().toISOString() });
    onConcluido?.();
  };

  const prever = async (studentId: string) => {
    const { data, error } = await supabase.rpc("partner_preview_student" as never, { _student_id: studentId, _partner_id: partnerId } as never);
    if (error) return falhar(error.message);
    if (!data) return falhar("Aluno não encontrado.");
    setEtapa({ fase: "aluno", preview: data as unknown as AlunoPreview });
  };

  const preverCupom = async (token: string) => {
    const { data, error } = await supabase.rpc("partner_preview_coupon" as never, { p_token: token } as never);
    if (error) return falhar(error.message);
    const linha = (data as unknown as CupomPreview[] | null)?.[0];
    if (!linha) return falhar("Cupom não encontrado ou não pertence à sua empresa.");
    setEtapa({ fase: "cupom", preview: linha, token });
  };

  const aoLer = async (lido: string) => {
    setAberto(false);
    if (ocupado.current) return;
    const qr = classificarQrDoAluno(lido);
    if (qr.tipo === "invalido") return falhar(`QR não reconhecido. ${QR_ACEITOS}`);
    ocupado.current = true;
    setEtapa({ fase: "processando" });
    try {
      if (qr.tipo === "reserva") await resgatarReserva(qr.token);
      else if (qr.tipo === "cupom") await preverCupom(qr.token);
      else await prever(qr.studentId);
    } finally {
      ocupado.current = false;
    }
  };

  // Um toque só por confirmação: o botão some no próximo render, mas um toque
  // duplo cai antes dele e registraria a visita (ou gastaria o cupom) duas vezes.
  const umaVez = async (acao: () => Promise<void>) => {
    if (ocupado.current) return;
    ocupado.current = true;
    try { await acao(); } finally { ocupado.current = false; }
  };

  const confirmarVisita = () => umaVez(async () => {
    if (etapa.fase !== "aluno") return;
    const { preview } = etapa;
    setEtapa({ fase: "processando" });
    const { data, error } = await supabase.rpc("partner_scan_student" as never, { _student_id: preview.student_id, _partner_id: partnerId } as never);
    if (error) return falhar(error.message);
    const r = data as unknown as VisitaRegistrada | null;
    const nome = r?.student_name ?? preview.student_name;
    toast.success(`Check-in: ${nome}`);
    setEtapa({ fase: "feito", nome, avatar: r?.student_avatar ?? preview.student_avatar, mensagem: "Visita registrada com sucesso", quando: r?.visited_at ?? new Date().toISOString() });
    onConcluido?.();
  });

  const confirmarCupom = () => umaVez(async () => {
    if (etapa.fase !== "cupom") return;
    const { preview, token } = etapa;
    setEtapa({ fase: "processando" });
    const { error } = await supabase.rpc("partner_redeem_coupon" as never, { p_token: token } as never);
    if (error) return falhar(error.message);
    toast.success(`Cupom validado: ${preview.product_name}`);
    setEtapa({ fase: "feito", nome: preview.student_name, avatar: preview.student_photo, mensagem: `Cupom validado — ${preview.product_name}`, quando: new Date().toISOString() });
    onConcluido?.();
  });

  return (
    <div className="space-y-3">
      {etapa.fase === "ocioso" && (
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/60 mb-3">
            Leia o QR que o aluno mostrar: <span className="text-primary">carteirinha, cupom de desconto ou reserva de benefício</span>.
          </p>
          <button onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
            <ScanLine className="h-4 w-4" /> Ler QR do aluno
          </button>
        </div>
      )}

      {etapa.fase !== "ocioso" && (
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          {etapa.fase === "processando" && (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          )}

          {etapa.fase === "aluno" && (
            <div className="text-center py-4">
              <p className="text-[11px] uppercase tracking-wider text-primary/80 font-bold mb-2">Confirme o aluno</p>
              <Foto url={etapa.preview.student_avatar} nome={etapa.preview.student_name} tamanho="h-28 w-28" />
              <p className="mt-3 text-xl font-bold text-white">{etapa.preview.student_name}</p>
              {etapa.preview.student_email && <p className="text-xs text-white/50">{etapa.preview.student_email}</p>}
              {(etapa.preview.student_city || etapa.preview.student_state) && (
                <p className="text-[11px] text-white/40">{[etapa.preview.student_city, etapa.preview.student_state].filter(Boolean).join(" / ")}</p>
              )}
              <p className="mt-3 text-xs text-white/60">É esta pessoa? Confirme para registrar a visita.</p>
              <BotoesDeConfirmacao rotulo="Confirmar" aoCancelar={fechar} aoConfirmar={confirmarVisita} />
            </div>
          )}

          {etapa.fase === "cupom" && (
            <div className="text-center py-4">
              <p className="text-[11px] uppercase tracking-wider text-primary/80 font-bold mb-2">Cupom de desconto</p>
              <Foto url={etapa.preview.student_photo} nome={etapa.preview.student_name} tamanho="h-24 w-24" />
              <p className="mt-3 text-lg font-bold text-white">{etapa.preview.student_name}</p>
              <p className="text-sm text-primary mt-1">{etapa.preview.product_name}</p>
              {janelaDoBeneficio(etapa.preview.benefit_start_time, etapa.preview.benefit_end_time) && (
                <p className="mx-auto mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                  <Clock className="h-3.5 w-3.5" /> {janelaDoBeneficio(etapa.preview.benefit_start_time, etapa.preview.benefit_end_time)}
                </p>
              )}
              <p className="text-[10px] text-white/40 mt-1">Gerado em {new Date(etapa.preview.created_at).toLocaleString("pt-BR")}</p>
              {etapa.preview.status !== "active" ? (
                <>
                  <p className="mt-3 text-sm text-red-400 font-bold">Cupom já {etapa.preview.status === "used" ? "utilizado" : "cancelado"}</p>
                  {etapa.preview.redeemed_at && <p className="text-[10px] text-white/40">em {new Date(etapa.preview.redeemed_at).toLocaleString("pt-BR")}</p>}
                  <button onClick={fechar} className="mt-4 rounded bg-white/10 px-4 py-2 text-sm text-white">OK</button>
                </>
              ) : (
                <>
                  <p className="mt-3 text-xs text-white/60">Confirme para aplicar o desconto. O cupom será marcado como usado.</p>
                  <BotoesDeConfirmacao rotulo="Validar" aoCancelar={fechar} aoConfirmar={confirmarCupom} />
                </>
              )}
            </div>
          )}

          {etapa.fase === "feito" && (
            <div className="text-center py-6">
              {etapa.avatar ? (
                <img src={etapa.avatar} className="mx-auto h-20 w-20 rounded-full object-cover" alt={etapa.nome} />
              ) : (
                <div className="mx-auto h-20 w-20 rounded-full bg-green-500/15 flex items-center justify-center">
                  <Check className="h-10 w-10 text-green-400" />
                </div>
              )}
              <p className="mt-3 text-lg font-bold text-white">{etapa.nome}</p>
              <p className="text-xs text-green-400 mt-1">{etapa.mensagem}</p>
              <p className="text-[10px] text-white/40 mt-1">{new Date(etapa.quando).toLocaleString("pt-BR")}</p>
              <button onClick={reiniciar} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Ler outro QR</button>
            </div>
          )}

          {etapa.fase === "erro" && (
            <div role="alert" className="text-center py-6">
              <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
              <p className="mt-2 text-sm text-red-300">{etapa.mensagem}</p>
              <button onClick={reiniciar} className="mt-4 rounded bg-white/10 px-4 py-2 text-sm text-white">Tentar novamente</button>
            </div>
          )}
        </div>
      )}

      {aberto && (
        <QRScannerModal
          title="Ler QR do aluno"
          hint="Aponte para o QR da carteirinha, do cupom ou da reserva do aluno."
          onClose={() => setAberto(false)}
          onScan={aoLer}
        />
      )}
    </div>
  );
}
