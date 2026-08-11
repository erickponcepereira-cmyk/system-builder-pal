import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyNetworkWhatsappGroups } from "@/lib/whatsapp-groups.functions";
import type { NetworkWhatsappGroup } from "@/lib/whatsapp-groups.shared";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";

/** Grupos de WhatsApp dos parceiros/profissionais da rede direta do usuário. */
export function NetworkWhatsappGroups({ className }: { className?: string }) {
  const listar = useServerFn(listMyNetworkWhatsappGroups);
  const [grupos, setGrupos] = useState<NetworkWhatsappGroup[]>([]);

  useEffect(() => {
    let vivo = true;
    listar({ data: undefined as never })
      .then((r) => { if (vivo) setGrupos(r.grupos); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (grupos.length === 0) return null;

  return (
    <div className={className ?? "space-y-2"}>
      {grupos.map((g) => (
        <WhatsAppGroupCard
          key={g.id}
          url={g.url}
          title={g.name}
          description={g.description}
          badge={g.ownerName}
        />
      ))}
    </div>
  );
}

export default NetworkWhatsappGroups;
