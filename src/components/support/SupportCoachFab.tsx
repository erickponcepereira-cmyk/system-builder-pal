import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { getMySponsorContact, type SponsorContact } from "@/lib/sponsor-contact.functions";
import { whatsappUrl } from "@/lib/whatsapp";
import { greeting, firstName } from "@/lib/purchase-messages";

/**
 * Botão flutuante de suporte nos painéis autenticados.
 *
 * - Ícone compacto do WhatsApp; clique expande/colapsa o balão.
 * - Balão mostra o texto curto e o link para o WhatsApp do patrocinador.
 * - Botão X fecha o componente durante a sessão atual.
 * - Não persiste dismiss: ao sair e voltar, o botão reaparece.
 */
export function SupportCoachFab() {
  const [sponsor, setSponsor] = useState<SponsorContact | null>(null);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMySponsorContact({ data: undefined as never });
        if (!cancelled) setSponsor(data);
      } catch {
        /* silencioso: é um atalho de suporte, não pode quebrar painel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !sponsor?.phone) return null;

  const msg = `${greeting()}, me chamo ${firstName(sponsor.myName) || "aluno(a)"}, sou da FitMind Club e tenho uma dúvida.`;
  const url = whatsappUrl(sponsor.phone, msg);
  if (!url) return null;

  return (
    <div className="fixed bottom-20 right-3 z-50 flex items-end gap-2 sm:bottom-6 sm:right-6">
      {expanded && (
        <div className="mb-1 flex max-w-[260px] flex-col gap-2 rounded-2xl border border-white/10 bg-card p-3 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              Dúvidas? Fale com seu coach
              {sponsor.name ? <span className="block text-xs font-normal text-muted-foreground">{sponsor.name}</span> : null}
            </span>
            <button
              type="button"
              aria-label="Fechar contato do coach"
              onClick={() => setVisible(false)}
              className="shrink-0 rounded-full bg-white/10 p-1 text-foreground/70 transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Abrir WhatsApp
          </a>
        </div>
      )}

      <button
        type="button"
        aria-label={expanded ? "Recolher contato do coach" : "Falar com meu coach"}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition hover:scale-105 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-background"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
