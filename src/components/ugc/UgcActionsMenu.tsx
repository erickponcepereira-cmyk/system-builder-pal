import { useState } from "react";
import { Ban, Flag, Loader2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  UGC_REPORT_REASONS,
  type UgcBlockTargetKind,
  type UgcTargetKind,
} from "@/lib/ugc";

export function UgcActionsMenu({
  targetKind,
  targetId,
  blockTarget,
  blockLabel = "Bloquear",
  onBlocked,
  className = "",
  elevated = false,
}: {
  targetKind: UgcTargetKind;
  targetId: string;
  blockTarget?: { kind: UgcBlockTargetKind; id: string };
  blockLabel?: string;
  onBlocked?: () => void;
  className?: string;
  /** Coloca o diálogo acima dos modais manuais da loja (z-index 80). */
  elevated?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const report = async () => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("ugc_report" as never, {
      _target_kind: targetKind,
      _target_id: targetId,
      _reason_code: reason,
      _details: details.trim() || null,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("daily report limit")
        ? "Limite diário de denúncias atingido."
        : "Não foi possível enviar a denúncia.");
      return;
    }
    toast.success("Denúncia enviada para análise.");
    setReportOpen(false);
    setMenuOpen(false);
    setDetails("");
  };

  const block = async () => {
    if (!blockTarget || saving) return;
    if (!window.confirm(`${blockLabel}? O conteúdo deixará de aparecer para você.`)) return;
    setSaving(true);
    const { error } = await supabase.rpc("ugc_set_block" as never, {
      _target_kind: blockTarget.kind,
      _target_id: blockTarget.id,
      _blocked: true,
    } as never);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível concluir o bloqueio.");
      return;
    }
    toast.success("Bloqueio aplicado.");
    setMenuOpen(false);
    onBlocked?.();
  };

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          aria-label="Ações de segurança"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-current opacity-70 hover:opacity-100"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-30 min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
            <button
              type="button"
              onClick={() => { setReportOpen(true); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <Flag className="h-4 w-4 text-destructive" /> Denunciar
            </button>
            {blockTarget && (
              <button
                type="button"
                onClick={block}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <Ban className="h-4 w-4" /> {blockLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className={`${elevated ? "z-[100]" : ""} max-w-md`}>
          <DialogHeader>
            <DialogTitle>Denunciar conteúdo</DialogTitle>
            <DialogDescription>
              A denúncia é confidencial. Nossa equipe avaliará o conteúdo e poderá removê-lo ou limitar a conta responsável.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              Motivo
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {UGC_REPORT_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Detalhes (opcional)
              <Textarea
                value={details}
                maxLength={2000}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Explique o que aconteceu sem incluir dados sensíveis."
                className="mt-1 min-h-24"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={report}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3 font-bold text-destructive-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar denúncia
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
