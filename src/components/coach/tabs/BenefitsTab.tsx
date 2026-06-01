import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Building2, QrCode, ScanLine, ShieldAlert } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { PartnerDetailsModal } from "@/components/partners/PartnerDetailsModal";
import { QRScannerModal } from "@/components/QRScannerModal";

type PartnerFreeProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  redemption_instructions: string | null;
  stock: number | null;
  partner_id: string;
  partners: { fantasy_name: string; photo_url: string | null; city: string | null; state: string | null; status: string } | null;
};

export function CoachBenefitsTab() {
  const navigate = useNavigate();
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPartner, setOpenPartner] = useState<string | null>(null);
  const [showMyQR, setShowMyQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const [coachId, setCoachId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [cardValidUntil, setCardValidUntil] = useState<string | null>(null);
  const cardActive = !!(cardValidUntil && new Date(cardValidUntil).getTime() > Date.now());

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
        if (profile) {
          const { data: coach } = await supabase
            .from("coaches").select("id, card_valid_until").eq("profile_id", profile.id).maybeSingle();
          if (coach) {
            const c = coach as unknown as { id: string; card_valid_until: string | null };
            setCoachId(c.id);
            setCardValidUntil(c.card_valid_until);
          }
          const { data: student } = await supabase
            .from("students").select("id").eq("profile_id", profile.id).maybeSingle();
          if (student) setStudentId((student as { id: string }).id);
        }
      }

      const { data } = await supabase
        .from("partner_products" as never)
        .select("id,name,description,image_url,redemption_instructions,stock,partner_id,partners(fantasy_name,photo_url,city,state,status)" as never)
        .eq("kind" as never, "free" as never)
        .eq("status" as never, "approved" as never)
        .eq("is_active_by_partner" as never, true as never)
        .order("created_at" as never, { ascending: false });
      const pf = ((data as unknown as PartnerFreeProduct[]) || []).filter((x) => x.partners?.status === "approved");
      setPartnerFreebies(pf);
      setLoading(false);
    })();
  }, []);

  const handleScan = (decoded: string) => {
    setShowScanner(false);
    const uuid = decoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!uuid) { toast.error("QR Code inválido"); return; }
    if (decoded.includes("/partner-checkin/")) {
      navigate({ to: "/partner-checkin/$partnerId", params: { partnerId: uuid } });
    } else {
      setOpenPartner(uuid);
    }
  };

  const checkinUrl = studentId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${studentId}`
    : coachId
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/coach/${coachId}`
      : "";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Gratuitos</h1>
        <p className="text-sm text-white/50">Brindes de empresas parceiras aprovados pelo admin</p>
      </div>

      {loading ? (
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-sm text-white/50">Carregando...</p>
        </div>
      ) : !cardActive ? (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-yellow-400" />
          <p className="mt-3 text-sm font-bold text-white">Sua carteirinha de coach está inativa</p>
          <p className="mt-1 text-xs text-white/60">
            Para acessar o portal de gratuitos é necessário ter a carteirinha ativa. Renove comprando o curso de coach ou solicite ativação ao admin.
          </p>
          {cardValidUntil && (
            <p className="mt-2 text-[11px] text-white/40">Validade anterior: {new Date(cardValidUntil).toLocaleDateString("pt-BR")}</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setShowMyQR(true)}
              className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
            >
              <QrCode className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-bold text-white">Mostrar meu QR</p>
              <p className="text-[11px] text-white/55">O parceiro lê seu QR</p>
            </button>
            <button
              onClick={() => setShowScanner(true)}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
            >
              <ScanLine className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-bold text-white">Ler QR do parceiro</p>
              <p className="text-[11px] text-white/55">Aponte para o QR da empresa</p>
            </button>
          </div>

          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            {partnerFreebies.length === 0 ? (
              <p className="text-sm text-white/50">Nenhum brinde de empresa parceira disponível no momento.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {partnerFreebies.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setOpenPartner(p.partner_id)}
                    className="text-left rounded-xl border border-white/5 overflow-hidden transition hover:border-primary/40"
                    style={{ backgroundColor: "#0F0F0F" }}
                  >
                    {p.image_url && <img src={p.image_url} alt={p.name} className="h-32 w-full object-cover" />}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-white">{p.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">Grátis</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/50 flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partners?.fantasy_name}{p.partners?.city ? ` · ${p.partners.city}/${p.partners.state || ""}` : ""}</p>
                      {p.description && <p className="mt-2 text-xs text-white/60 line-clamp-3">{p.description}</p>}
                      {p.redemption_instructions && <p className="mt-2 text-[11px] text-yellow-400/80 line-clamp-2">⚠ {p.redemption_instructions}</p>}
                      {p.stock !== null && <p className="mt-2 text-[10px] text-white/40">Estoque: {p.stock}</p>}
                      <div className="mt-3 w-full rounded-lg bg-primary/15 py-2 text-center text-xs font-semibold text-primary">Ver empresa</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {openPartner && (
        <PartnerDetailsModal
          partnerId={openPartner}
          onClose={() => setOpenPartner(null)}
          readOnly
        />
      )}

      {showMyQR && checkinUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setShowMyQR(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-wider text-black/50 font-bold">Carteirinha do coach</p>
            <p className="mt-1 text-sm font-bold text-black/80">Apresente para o parceiro</p>
            <div className="mt-4 flex justify-center">
              <QRCodeSVG value={checkinUrl} size={220} level="H" includeMargin={false} />
            </div>
            {coachId && <p className="mt-3 text-[10px] text-black/50">Coach: {coachId.slice(0, 8).toUpperCase()}</p>}
            {cardValidUntil && <p className="text-[10px] text-black/50">Válido até {new Date(cardValidUntil).toLocaleDateString("pt-BR")}</p>}
            <button onClick={() => setShowMyQR(false)} className="mt-4 w-full rounded-lg bg-black py-2 text-sm font-bold text-white">
              Fechar
            </button>
          </div>
        </div>
      )}

      {showScanner && (
        <QRScannerModal
          onClose={() => setShowScanner(false)}
          onScan={handleScan}
          title="Ler QR do parceiro"
        />
      )}
    </>
  );
}

export default CoachBenefitsTab;
