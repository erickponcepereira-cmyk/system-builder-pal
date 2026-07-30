import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { getMySponsorContact, type SponsorContact } from "@/lib/sponsor-contact.functions";
import { whatsappUrl } from "@/lib/whatsapp";
import { greeting, firstName } from "@/lib/purchase-messages";

const DISMISS_KEY = "fitmind:coach-fab-dismissed";

/**
 * Botão flutuante presente em todos os painéis autenticados:
 * "Dúvidas? Entre em contato com seu coach" → WhatsApp do patrocinador.
 *
 * Se não houver patrocinador com telefone cadastrado, não renderiza nada
 * (melhor sumir do que abrir um link quebrado).
 */
export function SupportCoachFab() {
  const [sponsor, setSponsor] = useState<SponsorContact | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMySponsorContact({ data: undefined as never });
        if (!cancelled) setSponsor(data);
      } catch {
        /* silencioso: é um atalho de suporte, não pode quebrar painel */
      }
      if (!cancelled) {
        setHidden(sessionStorage.getItem(DISMISS_KEY) === "1");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden || !sponsor?.phone) return null;

  const msg = `${greeting()}, me chamo ${firstName(sponsor.myName) || "aluno(a)"}, sou da FitMind Club e tenho uma dúvida.`;
  const url = whatsappUrl(sponsor.phone, msg);
  if (!url) return null;

  return (
    <div className="fixed bottom-20 right-3 z-50 flex items-end gap-1 sm:bottom-6 sm:right-6">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600"
      >
        <MessageCircle className="h-4 w-4 shrink-0" />
        <span className="max-w-[190px] text-left leading-tight">
          Dúvidas? Entre em contato com seu coach
          {sponsor.name ? <span className="block text-[10px] font-normal opacity-80">{sponsor.name}</span> : null}
        </span>
      </a>
      <button
        type="button"
        aria-label="Ocultar contato do coach"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setHidden(true);
        }}
        className="rounded-full bg-black/60 p-1 text-white/70 transition hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
