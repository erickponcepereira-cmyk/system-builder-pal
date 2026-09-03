import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { COMMUNITY_POLICY_VERSION } from "@/lib/ugc";

export function CommunityPolicyDialog({
  open,
  onOpenChange,
  onAccepted,
  unavailableReason,
  elevated = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
  unavailableReason?: string | null;
  /** Usa uma camada acima dos modais manuais da loja. */
  elevated?: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!confirmed || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("ugc_accept_policy" as never, {
      _policy_version: COMMUNITY_POLICY_VERSION,
    } as never);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar o aceite. Tente novamente.");
      return;
    }
    toast.success("Diretrizes aceitas.");
    onAccepted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${elevated ? "z-[100]" : ""} max-w-md`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Diretrizes da comunidade
          </DialogTitle>
          <DialogDescription>
            Antes de publicar, confirme que você respeitará as regras de convivência e segurança do FitMind Club.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Não publique assédio, ódio, nudez, ameaças, fraude, spam, conteúdo ilegal ou dados pessoais de terceiros.</p>
          <p>Conteúdo pode ser denunciado, removido e resultar em limitação ou suspensão da publicação.</p>
          <Link
            to="/diretrizes-da-comunidade"
            target="_blank"
            className="inline-flex font-semibold text-primary hover:underline"
          >
            Ler as diretrizes completas
          </Link>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-foreground">
            <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
            <span>Li e aceito as Diretrizes da Comunidade, versão {COMMUNITY_POLICY_VERSION}.</span>
          </label>
          {unavailableReason && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              O serviço de segurança está temporariamente indisponível. A publicação permanece bloqueada para proteger a comunidade.
            </p>
          )}
          <button
            type="button"
            disabled={!confirmed || saving || !!unavailableReason}
            onClick={accept}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Aceitar e continuar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

