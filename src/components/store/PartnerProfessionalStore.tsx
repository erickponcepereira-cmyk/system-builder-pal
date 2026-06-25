import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShoppingBag, TrendingUp, Eye, EyeOff, Share2 } from "lucide-react";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { AvailabilityPicker } from "@/components/professional/AvailabilityPicker";
import { computeFromCharge, type CoachCommissionPct } from "@/lib/partnerFinance";
import { useMyReferralCode, shareReferralProduct } from "@/lib/useMyReferralCode";

type Kind = "partner" | "professional";

type Section = { id: string; name: string; image_url: string | null; target_audience?: string | null };
type Category = { id: string; section_id: string; name: string; image_url: string | null };

export type PartnerStoreCard = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  section_id: string | null;
  category_id: string | null;
  seller: string;
  kind: Kind;
  isSchedulable?: boolean;
  professionalCoachId?: string | null;
  durationMinutes?: number;
  scheduledSlot?: string | null;
  coachCommissionPct?: number | null;
};

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  kind: Kind;
  mode?: "student" | "reseller";
  resellerStudent?: { id: string; name: string; email?: string | null } | null;
  /** Quando informado, o componente delega a compra ao carrinho da página pai. */
  onAddToCart?: (item: PartnerStoreCard) => void;
}

export function PartnerProfessionalStore({ kind, mode = "student", resellerStudent, onAddToCart }: Props) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<PartnerStoreCard[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<PartnerStoreCard | null>(null);
  const [buying, setBuying] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [ownStudentId, setOwnStudentId] = useState<string | null>(null);
  const [payOrder, setPayOrder] = useState<{ id: string; total: number; number: string; email: string; name: string } | null>(null);
  const myReferralCode = useMyReferralCode();

  const handleShare = async (productId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!myReferralCode) {
      toast.error("Seu código de indicação ainda não está disponível.");
      return;
    }
    const ok = await shareReferralProduct(myReferralCode, productId);
    if (ok) toast.success("Link de indicação copiado!");
    else toast.error("Não foi possível compartilhar o link.");
  };


  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from("store_sections").select("id,name,image_url").eq("is_active", true).order("sort_order"),
        supabase.from("store_categories").select("id,section_id,name,image_url").eq("is_active", true).order("sort_order"),
      ]);
      setSections((s as Section[]) || []);
      setCategories((c as Category[]) || []);

      if (mode === "student") {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
          if (prof?.id) {
            const { data: stu } = await supabase.from("students").select("id").eq("profile_id", prof.id).maybeSingle();
            if (stu?.id) setOwnStudentId(stu.id);
          }
        }
      }

      if (kind === "partner") {
        const { data, error } = await supabase
          .from("partner_products" as never)
          .select("id,name,description,image_url,price,section_id,category_id,partner_id,coach_commission_percentage,partners(fantasy_name)")
          .eq("status" as never, "approved")
          .eq("kind" as never, "paid")
          .eq("is_active_by_partner" as never, true)
          .is("deleted_at" as never, null as never);
        if (error) console.error("[partner store]", error);
        setCards(
          ((data as unknown as Array<{ id: string; name: string; description: string | null; image_url: string | null; price: number; section_id: string | null; category_id: string | null; coach_commission_percentage?: number | null; partners?: { fantasy_name: string | null } | null }>) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.partners?.fantasy_name || "Parceiro",
            kind: "partner",
            coachCommissionPct: r.coach_commission_percentage ?? null,
          })),
        );
      } else {
        const { data, error } = await supabase
          .from("professional_products" as never)
          .select(
            "id,name,description,image_url,price,section_id,category_id,coach_id,is_schedulable,default_duration_minutes,coach_commission_percentage,coaches!professional_products_coach_id_fkey(profile:profiles!coaches_profile_id_fkey(name))",
          )
          .eq("status" as never, "approved")
          .eq("is_active_by_professional" as never, true);
        if (error) console.error("[pp store]", error);
        setCards(
          ((data as unknown as Array<{ id: string; name: string; description: string | null; image_url: string | null; price: number; section_id: string | null; category_id: string | null; coach_id: string; is_schedulable?: boolean; default_duration_minutes?: number; coach_commission_percentage?: number | null; coaches?: { profile?: { name: string | null } | null } | null }>) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.coaches?.profile?.name || "Profissional",
            kind: "professional",
            isSchedulable: !!r.is_schedulable,
            professionalCoachId: r.coach_id,
            durationMinutes: r.default_duration_minutes ?? 30,
            coachCommissionPct: r.coach_commission_percentage ?? null,
          })),
        );
      }
      setLoading(false);
    })();
  }, [kind, mode]);

  const handleAddToCart = () => {
    if (!selected) return;
    if (selected.isSchedulable && !slot) {
      toast.error("Selecione um horário para agendar.");
      return;
    }
    onAddToCart?.({ ...selected, scheduledSlot: slot });
    toast.success("Adicionado ao carrinho.");
    setSelected(null);
    setSlot(null);
  };

  const buy = async (method: "pix" | "card") => {
    if (!selected) return;
    if (selected.isSchedulable && !slot) {
      toast.error("Selecione um horário para agendar.");
      return;
    }
    if (mode === "reseller" && !resellerStudent?.id) {
      toast.error("Selecione um aluno antes de comprar.");
      return;
    }
    if (selected.kind === "partner" && mode === "student" && !ownStudentId) {
      toast.error("Conta de aluno não encontrada. Faça login como aluno para comprar.");
      return;
    }
    setBuying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      let ppId: string | null = null;
      const buyerStudentId = mode === "reseller" ? resellerStudent!.id : ownStudentId;
      if (selected.kind === "partner") {
        if (!buyerStudentId) throw new Error("Aluno não encontrado.");
        const { data, error } = await supabase.rpc("create_partner_company_order" as never, {
          _partner_product_id: selected.id,
          _student_id: buyerStudentId,
          _payment_method: method,
        } as never);
        if (error) throw new Error(error.message);
        ppId = data as unknown as string;
      } else if (selected.isSchedulable && slot) {
        const { data, error } = await supabase.rpc("create_scheduled_professional_order" as never, {
          _professional_product_id: selected.id,
          _starts_at: slot,
          _payment_method: method,
          ...(mode === "reseller" ? { _buyer_student_id: buyerStudentId } : {}),
        } as never);
        if (error) throw new Error(error.message);
        ppId = data as unknown as string;
      } else {
        const { data, error } = await supabase.rpc("create_partner_product_order" as never, {
          _professional_product_id: selected.id,
          _payment_method: method,
          ...(mode === "reseller" ? { _buyer_student_id: buyerStudentId } : {}),
        } as never);
        if (error) throw new Error(error.message);
        ppId = data as unknown as string;
      }
      if (!ppId) throw new Error("Pedido não retornado");
      const { data: od } = await supabase
        .from("partner_product_orders" as never)
        .select("id,order_number,gross_amount")
        .eq("id" as never, ppId as never)
        .maybeSingle();
      const o = od as unknown as { id: string; order_number: string; gross_amount: number } | null;
      setPayOrder({
        id: o?.id || String(ppId),
        total: Number(o?.gross_amount || selected.price),
        number: o?.order_number || "pedido",
        email: userData.user?.email || "",
        name: (userData.user?.user_metadata as { name?: string } | undefined)?.name || "",
      });
      setSelected(null);
      setSlot(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar pedido";
      toast.error(msg);
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (cards.length === 0) return <p className="text-sm text-white/50 text-center py-10">Nenhum produto disponível ainda.</p>;

  const usedSectionIds = new Set(cards.map((c) => c.section_id).filter(Boolean) as string[]);
  const visibleSections = sections.filter((s) => usedSectionIds.has(s.id));

  // Drill-down: section list → categories → products of category
  let body: ReactNode;
  if (!activeSection) {
    body = (
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white">Seções</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleSections.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className="group overflow-hidden rounded-2xl border border-white/5 text-left transition-colors hover:bg-accent" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="aspect-square w-full overflow-hidden bg-white/5">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><ShoppingBag className="h-8 w-8 text-white/30" /></div>
                )}
              </div>
              <p className="px-3 py-2 text-sm font-bold text-white">{s.name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    const sectionCats = categories.filter((c) => c.section_id === activeSection);
    const usedCatIds = new Set(cards.filter((c) => c.section_id === activeSection).map((c) => c.category_id).filter(Boolean) as string[]);
    const visibleCats = sectionCats.filter((c) => usedCatIds.has(c.id));
    const currentSection = sections.find((s) => s.id === activeSection);

    if (!activeCategory) {
      body = (
        <div className="space-y-3">
          <button onClick={() => setActiveSection(null)} className="text-xs text-white/60 hover:text-primary">← Voltar para seções</button>
          <h2 className="text-base font-bold text-white">{currentSection?.name}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleCats.map((c) => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)} className="group overflow-hidden rounded-2xl border border-white/5 text-left transition-colors hover:bg-accent" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="aspect-square w-full overflow-hidden bg-white/5">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><ShoppingBag className="h-7 w-7 text-white/30" /></div>
                  )}
                </div>
                <p className="px-3 py-2 text-sm font-bold text-white">{c.name}</p>
              </button>
            ))}
          </div>
        </div>
      );
    } else {
      const items = cards.filter((c) => c.section_id === activeSection && c.category_id === activeCategory);
      const currentCat = categories.find((c) => c.id === activeCategory);
      body = (
        <div className="space-y-3">
          <button onClick={() => setActiveCategory(null)} className="text-xs text-white/60 hover:text-primary">← Voltar para {currentSection?.name}</button>
          <h2 className="text-base font-bold text-white">{currentCat?.name}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => (
              <div key={p.id} className="relative">
                <button onClick={() => setSelected(p)} className="w-full rounded-2xl border border-white/5 p-3 text-left transition hover:ring-1 hover:ring-primary/40" style={{ backgroundColor: "#1A1A1A" }}>
                  <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-white/5">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-white/30" />
                    )}
                  </div>
                  <p className="text-[10px] uppercase font-bold text-white/40">{p.seller}</p>
                  <p className="min-h-[32px] text-xs font-medium text-white line-clamp-2">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-primary">{money(p.price)}</p>
                </button>
                {myReferralCode && (
                  <button
                    type="button"
                    onClick={(e) => handleShare(p.id, e)}
                    title="Compartilhar link de indicação"
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {items.length === 0 && <p className="col-span-full text-sm text-white/50">Nenhum produto nesta subcategoria.</p>}
          </div>
        </div>
      );
    }
  }


  return (
    <>
      {body}

      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => { setSelected(null); setSlot(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl bg-muted">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ShoppingBag className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              <button
                onClick={() => { setSelected(null); setSlot(null); }}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{selected.seller}</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">{selected.name}</h2>
                <p className="mt-2 text-2xl font-bold text-primary">{money(selected.price)}</p>
              </div>
              {selected.description && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground">{selected.description}</p>
                </div>
              )}
              {selected.isSchedulable && selected.professionalCoachId && (
                <AvailabilityPicker
                  professionalCoachId={selected.professionalCoachId}
                  durationMinutes={selected.durationMinutes || 30}
                  value={slot}
                  onChange={setSlot}
                />
              )}
              {mode === "reseller" && (
                <CommissionBreakdown price={selected.price} pct={selected.coachCommissionPct} />
              )}
              {mode === "reseller" && (
                <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Venda para o aluno
                  </p>
                  {resellerStudent ? (
                    <>
                      <p className="text-sm font-bold text-foreground">{resellerStudent.name}</p>
                      {resellerStudent.email && (
                        <p className="text-[11px] text-muted-foreground">{resellerStudent.email}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-foreground/70">
                      Você poderá selecionar o aluno no carrinho antes de finalizar.
                    </p>
                  )}
                </div>
              )}
              {onAddToCart ? (
                <button
                  onClick={handleAddToCart}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  Adicionar ao carrinho
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    disabled={buying}
                    onClick={() => buy("pix")}
                    className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {buying ? "Processando..." : "Comprar com PIX"}
                  </button>
                  <button
                    disabled={buying}
                    onClick={() => buy("card")}
                    className="flex-1 rounded-xl border border-primary/40 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    {buying ? "..." : "Comprar com Cartão"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {payOrder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Pagamento</h2>
                <p className="text-xs text-white/50">Pedido {payOrder.number}</p>
              </div>
              <button onClick={() => setPayOrder(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">Fechar</button>
            </div>
            <MercadoPagoCheckout
              source={{ kind: "partner_product_order", id: payOrder.id }}
              amount={payOrder.total}
              description={`Pedido ${payOrder.number}`}
              defaultPayer={{ email: payOrder.email, name: payOrder.name }}
              onApproved={() => { toast.success("Pagamento aprovado!"); setPayOrder(null); }}
            />
            <PayLinkShare orderNumber={payOrder.number} clientName={resellerStudent?.name} />
          </div>
        </div>
      )}
    </>
  );
}

function PayLinkShare({ orderNumber, clientName }: { orderNumber: string; clientName?: string | null }) {
  if (typeof window === "undefined") return null;
  const payLink = `${window.location.origin}/pay/${orderNumber}`;
  const waMsg = encodeURIComponent(
    `Olá ${clientName || ""}! Segue o link para finalizar seu pagamento:\n\n${payLink}`,
  );
  const waUrl = `https://wa.me/?text=${waMsg}`;
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-white/5 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Link de pagamento do cliente</p>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <span className="flex-1 truncate font-mono text-[11px] text-primary">{payLink}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(payLink); toast.success("Link copiado!"); }}
          className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
        >
          Copiar
        </button>
      </div>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:bg-[#20bd5a]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.522 5.845L.044 23.956l6.277-1.643A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-4.99-1.364l-.358-.212-3.724.976.993-3.631-.233-.374A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
        </svg>
        {clientName ? `Enviar pelo WhatsApp para ${clientName}` : "Enviar pelo WhatsApp"}
      </a>
    </div>
  );
}

function CommissionBreakdown({ price, pct }: { price: number; pct?: number | null }) {
  const [open, setOpen] = useState(false);
  if (!pct || pct <= 0 || price <= 0) return null;
  const cPct = pct as CoachCommissionPct;
  const pix = computeFromCharge(price, cPct, "pix");
  const card = computeFromCharge(price, cPct, "card");
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const cells = [
    { label: "Você", pixV: pix.coachNet, cardV: card.coachNet },
    { label: "Nível 1", pixV: pix.networkL1, cardV: card.networkL1 },
    { label: "Nível 2", pixV: pix.networkL2, cardV: card.networkL2 },
    { label: "Nível 3", pixV: pix.networkL3, cardV: card.networkL3 },
  ];
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="mb-3 flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Comissões deste produto</p>
        </div>
        {open ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
      </button>
      {open && (
        <>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {cells.map((c) => (
              <div key={c.label} className="rounded-lg bg-card p-2">
                <p className="text-muted-foreground">{c.label}</p>
                <div className="mt-1 space-y-0.5">
                  <p className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="text-muted-foreground">PIX</span>
                    <span className="font-bold text-foreground">{fmt(c.pixV)}</span>
                  </p>
                  <p className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="text-muted-foreground">Cartão</span>
                    <span className="font-bold text-foreground">{fmt(c.cardV)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sua comissão estimada (PIX)</span>
              <span className="font-bold text-primary">{fmt(pix.coachNet)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sua comissão estimada (Cartão)</span>
              <span className="font-bold text-primary">{fmt(card.coachNet)}</span>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Cálculo sobre o valor líquido (preço − taxa de cartão/pix, imposto e taxa do sistema). PIX não tem taxa de cartão, por isso a comissão é maior.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
