import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gift, Loader2, ArrowLeft, CheckCircle2, Clock, Building2, QrCode, ScanLine, ShieldAlert, Ticket, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FreebieDetailModal, type FreebieDetail } from "@/components/student/FreebieDetailModal";
import { PartnerDetailsModal } from "@/components/partners/PartnerDetailsModal";
import { QRScannerModal } from "@/components/QRScannerModal";

export const Route = createFileRoute("/student/freebies")({
  head: () => ({ meta: [{ title: "Gratuitos — FitMind Club" }] }),
  component: StudentFreebies,
});

type Freebie = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  kind: "physical" | "digital";
  stock: number | null;
  per_student_limit: number;
  valid_until: string | null;
  condition_note: string | null;
  location: string | null;
  address: string | null;
  event_date: string | null;
  event_time: string | null;
  sponsor_name: string | null;
  sponsor_bio: string | null;
  sponsor_avatar: string | null;
  sponsor_whatsapp: string | null;
  sponsor_instagram: string | null;
  sponsor_website: string | null;
  category: string | null;
};

type Redemption = {
  id: string;
  freebie_id: string;
  status: string;
  created_at: string;
  freebies: { name: string } | null;
};

type PartnerFreeProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  redemption_instructions: string | null;
  stock: number | null;
  partner_id: string;
  redemption_mode: "free" | "discount" | null;
  discount_percent: number | null;
  benefit_start_time: string | null;
  benefit_end_time: string | null;
  partners: { fantasy_name: string; photo_url: string | null; status: string; business_area: string | null } | null;
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

function StudentFreebies() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Freebie[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [selected, setSelected] = useState<FreebieDetail | null>(null);
  const [openPartner, setOpenPartner] = useState<string | null>(null);
  const [showMyQR, setShowMyQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pageMode, setPageMode] = useState<"free" | "discount">("free");
  const [coupon, setCoupon] = useState<{ token: string; productName: string; discountPercent: number | null; benefitWindow: string | null } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const generateCoupon = async (p: PartnerFreeProduct) => {
    setGenerating(p.id);
    const { data, error } = await supabase.rpc("student_generate_partner_coupon" as never, { p_partner_product_id: p.id } as never);
    setGenerating(null);
    if (error) { toast.error(error.message); return; }
    const rows = data as unknown as { coupon_id: string; token: string }[];
    if (!rows || rows.length === 0) { toast.error("Não foi possível gerar o cupom."); return; }
    setCoupon({ token: rows[0].token, productName: p.name, discountPercent: p.discount_percent, benefitWindow: formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) });
  };

  // Carteirinha gate
  const [studentId, setStudentId] = useState<string | null>(null);
  const [cardValidUntil, setCardValidUntil] = useState<string | null>(null);
  const [hasPartnerBenefit, setHasPartnerBenefit] = useState(false);
  const cardActive = hasPartnerBenefit || !!(cardValidUntil && new Date(cardValidUntil).getTime() > Date.now());

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (profile) {
        const { data: student } = await supabase
          .from("students").select("id, card_valid_until, partner_id").eq("profile_id", profile.id).maybeSingle();
        if (student) {
          const s = student as unknown as { id: string; card_valid_until: string | null; partner_id: string | null };
          setStudentId(s.id);
          setCardValidUntil(s.card_valid_until);
          // Check partner benefit
          const { data: benefit } = await supabase.rpc("student_has_partner_benefits" as never, { _student_id: s.id } as never);
          setHasPartnerBenefit(Boolean(benefit));
        }
      }
    }

    const [a, b, c] = await Promise.all([
      supabase.from("freebies" as never).select("*").eq("is_active" as never, true).order("sort_order"),
      supabase.from("freebie_redemptions" as never).select("id,freebie_id,status,created_at,freebies(name)" as never).order("created_at" as never, { ascending: false }),
      supabase
        .from("partner_products" as never)
        .select("id,name,description,image_url,redemption_instructions,stock,partner_id,redemption_mode,discount_percent,benefit_start_time,benefit_end_time,partners(fantasy_name,photo_url,status,business_area)" as never)
        .eq("kind" as never, "free" as never)
        .eq("status" as never, "approved" as never)
        .eq("is_active_by_partner" as never, true as never)
        .order("created_at" as never, { ascending: false }),
    ]);
    setItems((a.data as unknown as Freebie[]) || []);
    setMine((b.data as unknown as Redemption[]) || []);
    const pf = ((c.data as unknown as PartnerFreeProduct[]) || []).filter((p) => p.partners?.status === "approved");
    setPartnerFreebies(pf);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const redeem = async (id: string) => {
    setRedeeming(id);
    const { error } = await supabase.rpc("redeem_freebie" as never, { _freebie_id: id } as never);
    setRedeeming(null);
    if (error) return toast.error(error.message);
    toast.success("Brinde resgatado!");
    load();
  };

  const countMine = (id: string) => mine.filter((r) => r.freebie_id === id && r.status !== "cancelled").length;

  const handleScan = (decoded: string) => {
    setShowScanner(false);
    // Accept URL with /partner-checkin/<uuid> or /student/partners/<uuid> or raw uuid
    const uuid = decoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!uuid) {
      toast.error("QR Code inválido");
      return;
    }
    if (decoded.includes("/partner-checkin/")) {
      navigate({ to: "/partner-checkin/$partnerId", params: { partnerId: uuid } });
    } else {
      setOpenPartner(uuid);
    }
  };

  const checkinUrl = studentId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${studentId}`
    : "";

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#0F0F0F] px-4 py-3">
        <Link to="/student/store" className="text-white/60"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" /> {pageMode === "discount" ? "Clube de Descontos" : "Gratuitos"}
          </h1>
          <p className="text-xs text-white/50">
            {pageMode === "discount" ? "Cupons de desconto exclusivos de parceiros" : "Brindes e bônus para você resgatar"}
          </p>
        </div>
        <Link to="/student/partners" className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-3 py-1.5">
          <Building2 className="h-3.5 w-3.5" /> Parceiros
        </Link>
      </div>

      <div className="p-4">
        {loading ? (
          <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />
        ) : !cardActive ? (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-yellow-400" />
            <p className="mt-3 text-sm font-bold text-white">Sua carteirinha está inativa</p>
            <p className="mt-1 text-xs text-white/60">
              Para acessar o portal de gratuitos é necessário ter a carteirinha ativa. Compre um plano ou produto para ativar.
            </p>
            <Link to="/student/store" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
              Ver loja
            </Link>
          </div>
        ) : (
          <>
            {/* QR actions */}
            <div className="mb-5 grid grid-cols-2 gap-3">
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
              const freeCount = partnerFreebies.filter((p) => (p.redemption_mode ?? "free") === "free").length + items.length;
              const discountCount = partnerFreebies.filter((p) => p.redemption_mode === "discount").length;
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
                    Clube de Descontos{discountCount > 0 ? ` (${discountCount})` : ""}
                  </button>
                </div>
              );
            })()}

            {(() => {
              const filteredPartner = partnerFreebies.filter((p) =>
                pageMode === "discount" ? p.redemption_mode === "discount" : (p.redemption_mode ?? "free") === "free"
              );
              const showItems = pageMode === "free" && items.length > 0;
              const isEmpty = filteredPartner.length === 0 && !showItems;
              if (isEmpty) {
                return <p className="text-center text-sm text-white/50 mt-10">
                  {pageMode === "discount" ? "Nenhum cupom de desconto disponível no momento." : "Nenhum brinde disponível no momento."}
                </p>;
              }
              return null;
            })()}

            {(() => {
              const filteredPartner = partnerFreebies.filter((p) =>
                pageMode === "discount" ? p.redemption_mode === "discount" : (p.redemption_mode ?? "free") === "free"
              );
              if (filteredPartner.length === 0) return null;
              const byArea = new Map<string, PartnerFreeProduct[]>();
              filteredPartner.forEach((p) => {
                const area = p.partners?.business_area || "Outras áreas";
                if (!byArea.has(area)) byArea.set(area, []);
                byArea.get(area)!.push(p);
              });
              const areas = Array.from(byArea.entries()).sort((a, b) => a[0].localeCompare(b[0]));
              return (
                <div className="mb-6 space-y-5">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {pageMode === "discount" ? "Descontos de empresas parceiras" : "Brindes de empresas parceiras"}
                  </h2>
                  {areas.map(([area, list]) => (
                    <div key={area}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">{area}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((p) => {
                          const isDiscount = p.redemption_mode === "discount";
                          return (
                            <div
                              key={p.id}
                              className="text-left rounded-2xl overflow-hidden border border-white/5 block relative"
                              style={{ backgroundColor: "#1A1A1A" }}
                            >
                              {isDiscount && p.discount_percent ? (
                                <div className="absolute top-3 right-3 z-10 bg-primary text-primary-foreground text-sm font-extrabold px-3 py-1.5 rounded-lg shadow-lg">
                                  {p.discount_percent}% OFF
                                </div>
                              ) : null}
                              {p.image_url && (
                                <button type="button" onClick={() => setOpenPartner(p.partner_id)} className="block w-full">
                                  <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" />
                                </button>
                              )}
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-bold text-white">{p.name}</h3>
                                  {!isDiscount && <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">Grátis</span>}
                                </div>
                                <button type="button" onClick={() => setOpenPartner(p.partner_id)} className="mt-1 text-[11px] text-white/40 hover:text-white/70 block">
                                  {p.partners?.fantasy_name}
                                </button>
                                {p.description && <p className="mt-1 text-xs text-white/60 line-clamp-2">{p.description}</p>}
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
                    </div>
                  ))}
                </div>
              );
            })()}

            {pageMode === "free" && items.length > 0 && (() => {
              const byCat = new Map<string, Freebie[]>();
              items.forEach((it) => {
                const cat = it.category || "Geral";
                if (!byCat.has(cat)) byCat.set(cat, []);
                byCat.get(cat)!.push(it);
              });
              const cats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));
              return (
                <div className="space-y-5">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Brindes FitMind</h2>
                  {cats.map(([cat, list]) => (
                    <div key={cat}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">{cat}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((it) => {
                          const taken = countMine(it.id);
                          const limitReached = taken >= it.per_student_limit;
                          const outOfStock = it.stock !== null && it.stock <= 0;
                          const expired = it.valid_until && new Date(it.valid_until) < new Date();
                          const disabled = limitReached || outOfStock || !!expired || redeeming === it.id;
                          return (
                            <div
                              key={it.id}
                              className="rounded-2xl overflow-hidden border border-white/5 cursor-pointer transition hover:border-primary/40"
                              style={{ backgroundColor: "#1A1A1A" }}
                              onClick={() => setSelected({
                                id: it.id, title: it.name, description: it.description,
                                image_url: it.image_url, location: it.location, address: it.address,
                                event_date: it.event_date, event_time: it.event_time,
                                sponsor_name: it.sponsor_name, sponsor_bio: it.sponsor_bio,
                                sponsor_avatar: it.sponsor_avatar, sponsor_whatsapp: it.sponsor_whatsapp,
                                sponsor_instagram: it.sponsor_instagram, sponsor_website: it.sponsor_website,
                              })}
                            >
                              {it.image_url && <img src={it.image_url} alt={it.name} className="h-40 w-full object-cover" />}
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-bold text-white">{it.name}</h3>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">{it.kind === "digital" ? "Digital" : "Físico"}</span>
                                </div>
                                {it.description && <p className="mt-1 text-xs text-white/60 line-clamp-2">{it.description}</p>}
                                {it.condition_note && <p className="mt-2 text-[11px] text-yellow-400/80">⚠ {it.condition_note}</p>}
                                <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
                                  {it.stock !== null && <span>Estoque: {it.stock}</span>}
                                  <span>Limite: {it.per_student_limit}</span>
                                  {it.valid_until && <span>Até {new Date(it.valid_until).toLocaleDateString("pt-BR")}</span>}
                                </div>
                                <button
                                  disabled={disabled}
                                  onClick={(e) => { e.stopPropagation(); redeem(it.id); }}
                                  className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {redeeming === it.id ? "Resgatando..." :
                                   expired ? "Expirado" :
                                   outOfStock ? "Esgotado" :
                                   limitReached ? "Já resgatado" :
                                   "Resgatar grátis"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}


            {mine.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-bold text-white mb-3">Meus resgates</h2>
                <div className="space-y-2">
                  {mine.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-white">{r.freebies?.name || "—"}</p>
                        <p className="text-white/40">{new Date(r.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                      {r.status === "delivered"
                        ? <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Entregue</span>
                        : <span className="flex items-center gap-1 text-yellow-400"><Clock className="h-3.5 w-3.5" /> Pendente</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <FreebieDetailModal
          freebie={selected}
          onClose={() => setSelected(null)}
          onAttend={() => { redeem(selected.id); setSelected(null); }}
          attendLabel="Resgatar grátis"
        />
      )}

      {openPartner && (
        <PartnerDetailsModal
          partnerId={openPartner}
          onClose={() => setOpenPartner(null)}
          readOnly
        />
      )}

      {showMyQR && studentId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setShowMyQR(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-wider text-black/50 font-bold">Sua carteirinha</p>
            <p className="mt-1 text-sm font-bold text-black/80">Apresente para o parceiro</p>
            <div className="mt-4 flex justify-center">
              <QRCodeSVG value={checkinUrl} size={220} level="H" includeMargin={false} />
            </div>
            <p className="mt-3 text-[10px] text-black/50">ID: {studentId.slice(0, 8).toUpperCase()}</p>
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
    </div>
  );
}
