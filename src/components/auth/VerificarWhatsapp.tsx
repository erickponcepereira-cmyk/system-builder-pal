import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Check, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import {
  iniciarVerificacaoWhatsapp,
  conferirVerificacaoWhatsapp,
  type VerificacaoIniciada,
} from "@/lib/verificacao-whatsapp.functions";

/**
 * Verificação por WhatsApp — a pessoa manda, não a gente.
 *
 * Ela toca no botão, o WhatsApp abre com a mensagem já escrita, ela só envia.
 * Enquanto isso a tela pergunta ao servidor se já chegou. É mais fácil que
 * digitar código de e-mail e não depende de caixa de spam.
 */
export function VerificarWhatsapp({
  email,
  profileId,
  finalidade = "cadastro",
  onToken,
  onVerificado,
  onPreferirEmail,
}: {
  email?: string;
  profileId?: string;
  finalidade?: "cadastro" | "login" | "trocar_telefone" | "lead";
  onToken?: (token: string) => void;
  onVerificado?: (telefone: string | null) => void;
  onPreferirEmail?: () => void;
}) {
  const [dados, setDados] = useState<VerificacaoIniciada | null>(null);
  const [estado, setEstado] = useState<"iniciando" | "esperando" | "pronto" | "expirado" | "erro">("iniciando");
  const [erro, setErro] = useState<string | null>(null);
  const [demorou, setDemorou] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);


  const iniciar = useCallback(async () => {
    setEstado("iniciando");
    setErro(null);
    setDemorou(false);
    try {
      const r = await iniciarVerificacaoWhatsapp({ data: { email, profileId, finalidade } });
      setDados(r);
      onToken?.(r.token);
      setEstado("esperando");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui preparar a confirmação");
      setEstado("erro");
    }
  }, [email, profileId, finalidade, onToken]);


  useEffect(() => { void iniciar(); }, [iniciar]);

  // demorou demais: em vez de girar para sempre, oferece o caminho do e-mail
  useEffect(() => {
    if (estado !== "esperando") return;
    const t = setTimeout(() => setDemorou(true), 300000);
    return () => clearTimeout(t);
  }, [estado]);


  // pergunta ao servidor se a mensagem já chegou
  useEffect(() => {
    if (estado !== "esperando" || !dados) return;
    timer.current = setInterval(async () => {
      try {
        const r = await conferirVerificacaoWhatsapp({ data: { token: dados.token } });
        if (r.verificado) {
          setEstado("pronto");
          onVerificado?.(r.telefone);
        } else if (r.expirado) {
          setEstado("expirado");
        }
      } catch { /* rede instável: tenta de novo no próximo ciclo */ }
    }, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [estado, dados, onVerificado]);

  const caixa = "rounded-2xl border border-white/5 p-6";

  if (estado === "iniciando") {
    return (
      <div className={caixa} style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando a confirmação…
        </div>
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <div className={caixa} style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-white">Não deu para confirmar por WhatsApp agora</p>
            <p className="mt-1 text-sm text-white/50">{erro}</p>
            <button onClick={() => void iniciar()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5">
              <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (estado === "pronto") {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Conta confirmada</p>
            <p className="text-sm text-white/50">Seu WhatsApp está verificado. Pode seguir.</p>
          </div>
        </div>
      </div>
    );
  }

  if (estado === "expirado") {
    return (
      <div className={caixa} style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-sm text-white">O código expirou.</p>
        <p className="mt-1 text-sm text-white/50">Peça um novo e mande a mensagem em até 30 minutos.</p>
        <button onClick={() => void iniciar()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          <RefreshCw className="h-4 w-4" /> Gerar novo código
        </button>
      </div>
    );
  }

  // esperando
  return (
    <div className={caixa} style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-base font-medium text-white">Confirme sua conta pelo WhatsApp</p>
      <p className="mt-1 text-sm text-white/50">
        Toque no botão. O WhatsApp abre com a mensagem pronta — você só precisa enviar.
      </p>

      <a
        href={dados!.link}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-black hover:opacity-90"
      >
        <MessageCircle className="h-5 w-5" /> Abrir o WhatsApp e enviar
      </a>

      <div className="mt-4 flex items-center gap-2 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Esperando sua mensagem…
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-xs text-white/50">Se o botão não abrir, mande esta mensagem para {dados!.numero}:</p>
        <p className="mt-1 font-mono text-xs text-white">{dados!.mensagem}</p>
      </div>

      {demorou && onPreferirEmail && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-white">Ainda não recebemos sua mensagem.</p>
          <p className="mt-1 text-xs text-white/50">
            Se preferir não esperar, dá para confirmar pelo e-mail agora mesmo.
          </p>
          <button
            type="button"
            onClick={onPreferirEmail}
            className="mt-3 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Confirmar por e-mail
          </button>
        </div>
      )}

    </div>
  );
}
