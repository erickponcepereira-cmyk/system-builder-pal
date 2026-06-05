import { MessageCircle, ExternalLink } from "lucide-react";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/DRL5UoT9rJAIomTSMaSHic?mode=gi_t";

export function WhatsAppGroupCard() {
  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent p-4 transition-transform hover:scale-[1.01]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20">
        <MessageCircle className="h-6 w-6 text-emerald-400" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-white">Entre no nosso grupo exclusivo do WhatsApp</p>
        <p className="text-[11px] text-white/55">Novidades, dicas e comunidade FitMind 💬</p>
      </div>
      <ExternalLink className="h-4 w-4 text-emerald-400" />
    </a>
  );
}

export default WhatsAppGroupCard;
