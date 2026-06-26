import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { maskCPFSensitive, formatCPF } from "@/lib/masks";
import { adminRevealCpf } from "@/lib/lgpd.functions";
import { toast } from "sonner";

interface Props {
  /** CPF mascarado vindo do banco. Pode ser null. */
  cpf?: string | null;
  /** user_id do dono — necessário para o botão admin "Revelar". Se null, sem botão. */
  targetUserId?: string | null;
  /** true se quem está vendo é o dono — mostra valor completo, sem botão. */
  isOwner?: boolean;
  /** true se quem está vendo é admin — habilita o botão "Revelar" com audit log. */
  isAdmin?: boolean;
  /** Texto extra opcional ("CPF:" etc.) */
  prefix?: string;
  className?: string;
}

/**
 * Exibição de CPF compatível com LGPD:
 * - Para o próprio dono: mostra valor completo.
 * - Para admin: mostra mascarado com botão "Revelar" que pede justificativa e
 *   grava em `lgpd_access_log` antes de retornar o valor.
 * - Para demais perfis: apenas mascarado, sem revelação possível.
 */
export function CpfDisplay({ cpf, targetUserId, isOwner, isAdmin, prefix, className }: Props) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reveal = useServerFn(adminRevealCpf);

  if (!cpf) return null;

  const display = isOwner
    ? formatCPF(cpf)
    : revealed
      ? formatCPF(revealed)
      : maskCPFSensitive(cpf);

  const canReveal = !isOwner && isAdmin && targetUserId && !revealed;

  const onReveal = async () => {
    const reason = window.prompt(
      "Justificativa para revelar o CPF (será registrada em log de auditoria LGPD):",
      ""
    );
    if (reason === null) return; // cancelou
    setLoading(true);
    try {
      const full = await reveal({ data: { targetUserId: targetUserId!, reason: reason.trim() || null } });
      setRevealed(full ?? null);
      toast.success("CPF revelado e registrado no log de auditoria.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao revelar CPF";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className || ""}`}>
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <span className="font-mono tabular-nums">{display}</span>
      {canReveal && (
        <button
          type="button"
          onClick={onReveal}
          disabled={loading}
          title="Revelar CPF (gera log de auditoria LGPD)"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
        </button>
      )}
      {revealed && (
        <button
          type="button"
          onClick={() => setRevealed(null)}
          title="Ocultar novamente"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary"
        >
          <EyeOff className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
