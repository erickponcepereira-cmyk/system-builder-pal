import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Users, Copy, Share2, AlertTriangle } from "lucide-react";

type Collab = {
  id: string;
  created_at: string;
  profiles: { name: string; email: string | null; phone: string | null; photo_url: string | null } | null;
};

const MAX_COLLABS = 7;

export function CollaboratorsTab({ coachId, displayName }: { coachId: string; displayName: string }) {
  const [referralCode, setReferralCode] = useState<string>("");
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("coaches").select("referral_code").eq("id", coachId).maybeSingle();
      if (c?.referral_code) setReferralCode(c.referral_code);

      const { data } = await supabase
        .from("students")
        .select("id, created_at, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false })
        .limit(50);
      setCollabs((data as unknown as Collab[]) || []);
      setLoading(false);
    })();
  }, [coachId]);

  const link = referralCode ? `${window.location.origin}/r/${referralCode}` : "";

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const share = async () => {
    if (!link) return;
    const text = `Você foi convidado(a) para entrar na rede de ${displayName} no FitMind Club. Crie sua conta:`;
    if (navigator.share) {
      try { await navigator.share({ title: displayName, text, url: link }); } catch { /* ignore */ }
    } else {
      copy();
    }
  };

  if (!referralCode) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
        <p className="text-sm text-white/70">Código de indicação ainda não gerado. Atualize a página em instantes.</p>
      </div>
    );
  }

  const reached = collabs.length >= MAX_COLLABS;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Users className="h-7 w-7 text-primary mx-auto mb-2" />
        <h2 className="text-base font-bold text-white">Convidar colaboradores</h2>
        <p className="mt-1 text-xs text-white/50">
          Compartilhe este link. Eles entram vinculados a <b className="text-white/80">{displayName}</b>.
        </p>
        <p className="mt-2 text-[11px] text-white/60">
          Limite: <b className={reached ? "text-red-400" : "text-primary"}>{collabs.length} / {MAX_COLLABS}</b>
        </p>

        {!reached ? (
          <>
            <div className="mt-4 inline-block bg-white p-3 rounded-xl">
              <QRCodeSVG value={link} size={180} />
            </div>
            <div className="mt-3 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 break-all">{link}</div>
            <p className="mt-2 text-[10px] text-white/40">Código: <span className="font-mono text-white/70">{referralCode}</span></p>
            <div className="mt-4 flex gap-2">
              <button onClick={copy} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20">
                <Copy className="h-3.5 w-3.5" /> Copiar link
              </button>
              <button onClick={share} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">
                <Share2 className="h-3.5 w-3.5" /> Compartilhar
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs text-yellow-200">
            Limite de {MAX_COLLABS} colaboradores atingido.
          </div>
        )}
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Meus colaboradores</h3>
          <span className="text-[11px] text-white/50">{collabs.length} / {MAX_COLLABS}</span>
        </div>
        {loading ? (
          <p className="text-xs text-white/40">Carregando...</p>
        ) : collabs.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6">Nenhum colaborador cadastrado ainda. Compartilhe o link acima.</p>
        ) : (
          <div className="space-y-2">
            {collabs.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2">
                {c.profiles?.photo_url ? (
                  <img src={c.profiles.photo_url} className="h-9 w-9 rounded-full object-cover" alt={c.profiles.name} />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">{c.profiles?.name?.[0]?.toUpperCase() || "?"}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.profiles?.name || "—"}</p>
                  <p className="text-[10px] text-white/40 truncate">{c.profiles?.email || c.profiles?.phone || ""}</p>
                  <p className="text-[10px] text-primary/80 truncate font-semibold">Colaborador · {displayName}</p>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase font-bold whitespace-nowrap">Colab.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollaboratorsTab;
