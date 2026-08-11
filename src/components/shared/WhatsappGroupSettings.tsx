import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageCircle, Save } from "lucide-react";
import { getMyWhatsappGroup, saveMyWhatsappGroup } from "@/lib/whatsapp-groups.functions";
import { resolveGroupUrl } from "@/lib/whatsapp-groups.shared";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";

type Props = {
  ownerKind: "partner" | "professional";
  ownerId: string;
  ownerName?: string;
};

/** Aba "Meu grupo do WhatsApp" para parceiros e profissionais. */
export function WhatsappGroupSettings({ ownerKind, ownerId, ownerName }: Props) {
  const carregar = useServerFn(getMyWhatsappGroup);
  const salvar = useServerFn(saveMyWhatsappGroup);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    carregar({ data: { ownerKind, ownerId } })
      .then((r) => {
        if (!vivo) return;
        if (r.grupo) {
          setNome(r.grupo.name);
          setAlvo(r.grupo.inviteUrl || r.grupo.phone || "");
          setDescricao(r.grupo.description || "");
          setAtivo(r.grupo.isActive);
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [ownerKind, ownerId]);

  const previewUrl = /^https?:\/\//i.test(alvo.trim())
    ? alvo.trim()
    : resolveGroupUrl(null, alvo.trim());

  const onSalvar = async () => {
    if (nome.trim().length < 2) { toast.error("Informe o nome do grupo."); return; }
    if (!alvo.trim()) { toast.error("Informe o link do grupo ou o número."); return; }
    setSaving(true);
    try {
      await salvar({
        data: { ownerKind, ownerId, name: nome.trim(), target: alvo.trim(), description: descricao.trim() || null, isActive: ativo },
      });
      toast.success("Grupo salvo! Sua rede direta já consegue ver.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-2xl border border-white/10 p-4 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-bold text-white">Meu grupo do WhatsApp</h2>
            <p className="text-[11px] text-white/50">
              Aparece para alunos e coaches vinculados diretamente a você, logo abaixo do grupo oficial FitMind.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs text-white/60">Nome do grupo</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={ownerName ? `Time ${ownerName}` : "Nome do grupo"}
            maxLength={80}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs text-white/60">Link do grupo ou número de WhatsApp</label>
          <input
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            placeholder="https://chat.whatsapp.com/... ou (65) 99999-9999"
            maxLength={200}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
          />
          <p className="mt-1 text-[10px] text-white/40">
            Aceita o link de convite do grupo ou um número com DDD (abre a conversa direta).
          </p>
        </div>

        <div>
          <label className="text-xs text-white/60">Descrição curta (opcional)</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Avisos, treinos e novidades 💬"
            maxLength={140}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          Exibir para minha rede
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSalvar}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">
              Testar link
            </a>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <p className="text-xs text-white/50">Prévia de como sua rede vai ver:</p>
          <WhatsAppGroupCard
            url={previewUrl}
            title={nome || "Meu grupo do WhatsApp"}
            description={descricao || null}
            badge={ownerName || null}
          />
        </div>
      )}
    </div>
  );
}

export default WhatsappGroupSettings;
