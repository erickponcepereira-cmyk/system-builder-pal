import { MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

interface Props {
  phone?: string | null;
  message?: string;
  label?: string;
  size?: "sm" | "md" | "icon";
  className?: string;
}

/** Standard WhatsApp action — disabled if no phone is provided. */
export function WhatsAppButton({ phone, message, label, size = "sm", className }: Props) {
  const url = whatsappUrl(phone, message);
  const disabled = !url;
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors";
  const variants = {
    sm: "px-2.5 py-1.5 text-[11px]",
    md: "px-3 py-2 text-xs",
    icon: "h-8 w-8 p-0",
  } as const;

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title="Telefone não informado"
        className={cn(base, variants[size], "bg-white/5 text-white/30 cursor-not-allowed", className)}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {size !== "icon" && (label ?? "WhatsApp")}
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(base, variants[size], "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25", className)}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {size !== "icon" && (label ?? "WhatsApp")}
    </a>
  );
}
