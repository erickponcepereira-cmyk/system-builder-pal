import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Building2, QrCode, ScanLine, ShieldAlert, Ticket, Loader2, X, Clock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { PartnerDetailsModal } from "@/components/partners/PartnerDetailsModal";
import { QRScannerModal } from "@/components/QRScannerModal";
import { CouponModal } from "@/components/student/CouponModal";

type PartnerFreeProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  redemption_instructions: string | null;
  stock: number | null;
  redemption_mode: "free" | "discount" | null;
  discount_percent: number | null;
  benefit_start_time: string | null;
  benefit_end_time: string | null;
  partner_id: string;
  partners: { fantasy_name: string; photo_url: string | null; city: string | null; state: string | null; status: string } | null;
};

function formatBenefitWindow(start?: string | null, end?: string | null) {
  const fmt = (value?: string | null) => value ? value.slice(0, 5) : null;
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `Disponível das ${s} às ${e}`;
  if (s) return `Disponível a partir das ${s}`;
  if (e) return `Disponível até ${e}`;
  return null;
}


export function CoachBenefitsTab({ forceActive = false }: { forceActive?: boolean } = {}) {
  const navigate = useNavigate();
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPartner, setOpenPartner] = useState<string | null>(null);
  const [showMyQR, setShowMyQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pageMode, setPageMode] = useState<"free" | "discount">("free");
  const [coupon, setCoupon] = useState<{ token: string; productName: string; discountPercent: number | null; benefitWindow: string | null } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);


  const [coachId, setCoachId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [cardValidUntil, setCardValidUntil] = useState<string | null>(null);
  const cardActive = forceActive || !!(cardValidUntil && new Date(cardValidUntil).getTime() > Date.now());

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
        .select("id,name,description,image_url,redemption_instructions,stock,redemption_mode,discount_percent,benefit_start_time,benefit_end_time,partner_id,partners(fantasy_name,photo_url,city,state,status)" as never)
        .eq("kind" as never, "free" as never)
        .eq("status" as never, "approved" as never)
        .eq("is_active_by_partner" as never, true as never)
        .is("deleted_at" as never, null as never)
        .order("created_at" as never, { ascending: false });
      const pf = ((data as unknown as PartnerFreeProduct[]) || []).filter((x) => x.partners?.status === "approved");
      setPartnerFreebies(pf);
      setLoading(false);
    })();
  }, []);

  const generateCoupon = async (p: PartnerFreeProduct) => {
    setGenerating(p.id);
    const { data, error } = await supabase.rpc("student_generate_partner_coupon" as never, { p_partner_product_id: p.id } as never);
    setGenerating(null);
    if (error) { toast.error(error.message); return; }
    const rows = data as unknown as { coupon_id: string; token: string }[];
    if (!rows || rows.length === 0) { toast.error("Não foi possível gerar o cupom."); return; }
    setCoupon({ token: rows[0].token, productName: p.name, discountPercent: p.discount_percent, benefitWindow: formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) });
  };

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
        <h1 className="text-2xl font-bold text-white">Benefícios de Parceiros</h1>
        <p className="text-sm text-white/50">Brindes e descontos de empresas parceiras aprovados pelo admin</p>
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

          {/* Page mode selector: Gratuitos | Clube de Descontos */}
          {(() => {
            const freeCount = partnerFreebies.filter((p) => (p.redemption_mode ?? "free") === "free").length;
            const discCount = partnerFreebies.filter((p) => p.redemption_mode === "discount").length;
            return (
              <div className="mb-5 grid grid-cols-2 gap-2 p-1.5 rounded-full bg-[#141414] border border-white/10">
                <button
                  onClick={() => setPageMode("free")}
                  className={`rounded-full py-2.5 text-sm font-bold transition ${pageMode === "free" ? "bg-primary text-primary-foreground shadow-lg" : "text-white/70 hover:text-white"}`}
                >
                  Gratuitos{freeCount > 0 ? ` (${freeCount})` : ""}
                </button>
                <button
                  onClick={() => setPageMode("discount")}
                  className={`rounded-full py-2.5 text-sm font-bold transition ${pageMode === "discount" ? "bg-primary text-primary-foreground shadow-lg" : "text-white/70 hover:text-white"}`}
                >
                  Clube de Descontos{discCount > 0 ? ` (${discCount})` : ""}
                </button>
              </div>
            );
          })()}

          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            {(() => {
              const list = partnerFreebies.filter((p) =>
                pageMode === "discount" ? p.redemption_mode === "discount" : (p.redemption_mode ?? "free") === "free"
              );
              if (list.length === 0) {
                return <p className="text-sm text-white/50">
                  {pageMode === "discount" ? "Nenhum cupom de desconto disponível no momento." : "Nenhum benefício gratuito disponível no momento."}
                </p>;
              }
              return (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => {
                    const isDiscount = p.redemption_mode === "discount";
                    return (
                      <div
                        key={p.id}
                        className="text-left rounded-xl border border-white/5 overflow-hidden transition hover:border-primary/40 relative"
                        style={{ backgroundColor: "#0F0F0F" }}
                      >
                        {isDiscount && p.discount_percent ? (
                          <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground text-xs font-extrabold px-2.5 py-1 rounded-lg shadow-lg">
                            {p.discount_percent}% OFF
                          </div>
                        ) : null}
                        {p.image_url && (
                          <button type="button" onClick={() => setOpenPartner(p.partner_id)} className="block w-full">
                            <img src={p.image_url} alt={p.name} className="h-32 w-full object-cover" />
                          </button>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-white">{p.name}</h3>
                            {!isDiscount && <span className="text-[10px] px-2 py-0.5 rounded uppercase bg-green-500/20 text-green-300">Grátis</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-white/50 flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partners?.fantasy_name}{p.partners?.city ? ` · ${p.partners.city}/${p.partners.state || ""}` : ""}</p>
                          {p.description && <p className="mt-2 text-xs text-white/60 line-clamp-3">{p.description}</p>}
                          {formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) && (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                              <Clock className="h-3.5 w-3.5" /> {formatBenefitWindow(p.benefit_start_time, p.benefit_end_time)}
                            </p>
                          )}
                          {p.redemption_instructions && <p className="mt-2 text-[11px] text-yellow-400/80 line-clamp-2">⚠ {p.redemption_instructions}</p>}
                          {p.stock !== null && <p className="mt-2 text-[10px] text-white/40">Estoque: {p.stock}</p>}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenPartner(p.partner_id)}
                              className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 py-2 text-xs font-semibold text-white/80"
                            >
                              Ver empresa
                            </button>
                            <button
                              type="button"
                              onClick={() => generateCoupon(p)}
                              disabled={generating === p.id}
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary hover:bg-primary/90 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
                            >
                              {generating === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
                              {isDiscount ? "Gerar cupom" : "Resgatar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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

      {coupon && <CouponModal coupon={coupon} onClose={() => setCoupon(null)} />}
    </>
  );
}

export default CoachBenefitsTab;
