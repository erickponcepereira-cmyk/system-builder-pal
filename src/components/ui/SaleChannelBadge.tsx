import { Store, UserCog } from "lucide-react";

export type SaleChannel = "store" | "coach" | null | undefined;

export function SaleChannelBadge({ channel, compact = false }: { channel: SaleChannel; compact?: boolean }) {
  if (!channel) {
    return <span className="text-white/30 text-[10px]">—</span>;
  }
  if (channel === "coach") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
        <UserCog className="h-3 w-3" />
        {compact ? "Coach" : "Coach vendeu"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-300">
      <Store className="h-3 w-3" />
      {compact ? "Loja" : "Loja (direto)"}
    </span>
  );
}

export function saleChannelLabel(channel: SaleChannel): string {
  if (channel === "coach") return "Coach vendeu";
  if (channel === "store") return "Loja (direto)";
  return "—";
}
