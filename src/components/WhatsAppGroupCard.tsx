import { MessageCircle, ExternalLink } from "lucide-react";
import { UgcActionsMenu } from "@/components/ugc/UgcActionsMenu";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/DRL5UoT9rJAIomTSMaSHic?mode=gi_t";

type Props = {
  url?: string;
  title?: string;
  description?: string | null;
  badge?: string | null;
  ugcGroupId?: string;
  onBlocked?: () => void;
};

export function WhatsAppGroupCard({ url, title, description, badge, ugcGroupId, onBlocked }: Props = {}) {
  return (
    <div className="relative flex items-center rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent transition-transform hover:scale-[1.01]">
      <a
        href={url || WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 p-4"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20">
          <MessageCircle className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {title || "Entre no nosso grupo exclusivo do WhatsApp"}
          </p>
          <p className="truncate text-[11px] text-white/55">
            {description || "Novidades, dicas e comunidade FitMind 💬"}
          </p>
          {badge && (
            <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
              {badge}
            </span>
          )}
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-emerald-400" />
      </a>
      {ugcGroupId && (
        <UgcActionsMenu
          targetKind="whatsapp_group"
          targetId={ugcGroupId}
          blockTarget={{ kind: "whatsapp_group", id: ugcGroupId }}
          blockLabel="Ocultar este grupo"
          onBlocked={onBlocked}
          className="mr-2 text-white"
        />
      )}
    </div>
  );
}

export default WhatsAppGroupCard;
