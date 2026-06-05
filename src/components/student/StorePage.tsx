import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Minus, Plus, Search, Share2, ShoppingBag, Sparkles, Tag, Trash2, History, UserRound, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listProductsWithRealEarnings } from "@/lib/coach-network.functions";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { ProductDetailModal, type ProductDetail, type ProfessionalCard } from "@/components/store/ProductDetailModal";
import { PartnerProfessionalStore } from "@/components/store/PartnerProfessionalStore";

type SaleClient = { id: string; name: string; email: string | null; phone: string | null; cpf?: string | null };
type CoachSaleRow = { orderId: string; orderNumber: string; status: string; total: number; createdAt: string; paymentMethod: string; clientName: string; productTitles: string; commissionAmount: number; commissionStatus: string | null };

type ProductKind = "challenge" | "digital" | "store" | "item" | "partner" | "partner_company";
type PaymentMethod = "pix" | "credit_card" | "debit_card";

const SPECIALTY_LABEL: Record<string, string> = {
  personal_trainer: "Personal Trainer",
  nutritionist: "Nutricionista",
  doctor: "Médico(a)",
  cardiologist: "Cardiologista",
  esthetician: "Esteticista",
  lawyer: "Advogado(a)",
  other: "Outro",
};

interface StoreProduct extends ProductDetail {
  sourceId: string;
  kind: ProductKind;
  isPriceRange?: boolean | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  creatorCoachId?: string | null;
  sectionId?: string | null;
  categoryId?: string | null;
}

type CartItem = StoreProduct & { quantity: number };
type OrderRow = { id: string; order_number: string; status: string; total_amount: number; created_at: string | null };

type ShippingForm = { name: string; phone: string; zip: string; address: string; city: string; state: string };

type SectionRow = { id: string; name: string; image_url: string | null; card_width: number | null; card_height: number | null };
type CategoryRow = { id: string; section_id: string; name: string; image_url: string | null; card_width: number | null; card_height: number | null };

const initialShipping: ShippingForm = { name: "", phone: "", zip: "", address: "", city: "", state: "" };

const productCategory = (type?: string | null) => ({
  enrollment: "Inscrições", plan_30: "Planos 30d", protocol_90: "Protocolos 90d",
  digital_course: "Cursos", coach_training: "Cursos", health_pro_course: "Cursos",
  live_class: "Aulões", room_rental: "Salas", herbalife: "Herbalife",
  physical: "Herbalife", challenge: "Planos 30d",
}[type || ""] || "Planos 30d");

interface StorePageProps {
  /** Quando true, modo coach: seleciona aluno e cria venda como coach. */
  coachMode?: boolean;
  /** Indica se o coach tem upline (para cálculo de comissão estimada). */
  hasUpline?: boolean;
}

export function StorePage({ coachMode = false, hasUpline = false }: StorePageProps = {}) {
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activeSection, setActiveSection] = useState<SectionRow | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<CategoryRow | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [shipping, setShipping] = useState<ShippingForm>(initialShipping);
  const [checkingOut, setCheckingOut] = useState(false);
  const [payOrder, setPayOrder] = useState<{ id: string; total: number; number: string; email: string; name: string; sourceKind: "store_order" | "partner_product_order" } | null>(null);

  const [detailProduct, setDetailProduct] = useState<StoreProduct | null>(null);
  const [detailProfessional, setDetailProfessional] = useState<ProfessionalCard | null>(null);
  const [storeSections, setStoreSections] = useState<SectionRow[]>([]);
  const [storeCategories, setStoreCategories] = useState<CategoryRow[]>([]);

  // Coach-only state
  const [clients, setClients] = useState<SaleClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<SaleClient | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [salesHistory, setSalesHistory] = useState<CoachSaleRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isMasterCoach, setIsMasterCoach] = useState(false);

  // Indicação aluno→aluno
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  const [indicableProductIds, setIndicableProductIds] = useState<Set<string>>(new Set());
  const [pendingReferrerStudentId, setPendingReferrerStudentId] = useState<string | null>(null);
  const [ownStudentId, setOwnStudentId] = useState<string | null>(null);

  const [storeTab, setStoreTab] = useState<"fitmind" | "partner" | "professional">("fitmind");

  const fetchRealEarnings = useServerFn(listProductsWithRealEarnings);

  const copyReferralLink = async (productSourceId: string) => {
    if (!myReferralCode) {
      toast.error("Seu código de indicação ainda não está disponível.");
      return;
    }
    const url = `${window.location.origin}/r/${myReferralCode}?p=${productSourceId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Indicação FitMind Club", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link de indicação copiado!");
      }
    } catch {
      await navigator.clipboard.writeText(url);
      toast.success("Link de indicação copiado!");
    }
  };

  const load = async () => {
    const [{ data: userData }, plans, digital, physical, sectionsRes, itemsRes, realEarnings] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("products").select("id,name,subtitle,description,price,original_price,type,product_type,is_price_range,min_price,max_price,badge_label,status,image_url,commission_coach,commission_level1,commission_level2,commission_level3,app_fee,app_fee_percentage,card_fee_percentage,credit_fee_percentage,tax_percentage,cost,other_costs,creator_coach_id,points_per_sale,duration_days,has_challenge_access").eq("status", "active").order("sort_order"),
      supabase.from("digital_products").select("id,title,description,price,original_price,type,status,is_featured,cover_url").eq("status", "active").order("sort_order"),
      supabase.from("store_products").select("id,name,description,price,original_price,category,status,is_herbalife,stock,image_url").eq("status", "active").order("sort_order"),
      supabase.from("store_sections" as never).select("id,name,image_url,card_width,card_height" as never).eq("is_active" as never, true as never).order("sort_order" as never),
      supabase.from("products" as never).select("id,section_id,category_id,name,short_description,description,image_url,price,original_price,kind,stock,is_active,commission_coach,commission_level1,commission_level2,commission_level3,app_fee,app_fee_percentage,card_fee_percentage,credit_fee_percentage,tax_percentage,cost,other_costs,creator_coach_id,points_per_sale,duration_days,has_challenge_access" as never).not("kind" as never, "is", null).eq("is_active" as never, true as never).order("sort_order" as never),
      fetchRealEarnings().catch(() => [] as any[]),
    ]);
    const { data: catRows } = await supabase.from("store_categories" as never).select("id,section_id,name,image_url,card_width,card_height" as never).eq("is_active" as never, true as never).order("sort_order" as never);
    setStoreCategories(((catRows as unknown as CategoryRow[]) || []));

    // Produtos de parceiros (profissionais) — apenas aprovados e ativos
    const { data: partnerRows } = await supabase
      .from("professional_products" as never)
      .select(
        "id,name,description,image_url,price,is_schedulable,default_duration_minutes,coach:coaches!professional_products_coach_id_fkey(id,specialty_key,profile:profiles!coaches_profile_id_fkey(name))" as never,
      )
      .eq("status" as never, "approved" as never)
      .eq("is_active_by_professional" as never, true as never)
      .order("created_at" as never, { ascending: false });
    const earningsById = new Map<string, any>((realEarnings as any[]).map((e) => [e.id, e]));

    const sections = (sectionsRes.data as unknown as SectionRow[]) || [];
    setStoreSections(sections);
    const sectionName = (id: string) => sections.find((s) => s.id === id)?.name || "Loja";

    if (!coachMode && userData.user) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: student } = profile?.id ? await supabase.from("students").select("id, referral_code").eq("profile_id", profile.id).maybeSingle() : { data: null };
      if (student?.id) {
        setOwnStudentId(student.id);
        setMyReferralCode((student as any).referral_code || null);
        const { data: orderData } = await supabase
          .from("store_orders" as never)
          .select("id,order_number,status,total_amount,created_at" as never)
          .eq("student_id" as never, student.id as never)
          .order("created_at" as never, { ascending: false })
          .limit(8);
        setOrders((orderData as unknown as OrderRow[]) || []);
      }

      // Produtos marcados no financeiro como Produto de indicação
      const { data: refRules } = await supabase
        .from("product_referral_rules" as never)
        .select("product_id" as never)
        .eq("enabled" as never, true as never)
        .eq("is_referral_product" as never, true as never);
      const ids = new Set<string>(((refRules as any[]) || []).map((r) => r.product_id));
      setIndicableProductIds(ids);

      // Indicação ativa em sessão (vinda de /r/{code}?p=…)
      try {
        const raw = sessionStorage.getItem("fitmind_referral");
        if (raw) {
          const parsed = JSON.parse(raw) as { referredByStudentId?: string | null };
          setPendingReferrerStudentId(parsed?.referredByStudentId || null);
        }
      } catch { /* ignore */ }
    }

    setItems([
      ...((plans.data || []).map((p: any) => {
        const e = earningsById.get(p.id);
        return ({
        id: `plan-${p.id}`, sourceId: p.id, title: p.name, subtitle: p.subtitle, description: p.description,
        price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
        category: productCategory(String(p.product_type || p.type)), kind: "challenge" as const,
        tag: p.badge_label || "FitMind", isPriceRange: p.is_price_range,
        minPrice: p.min_price ? Number(p.min_price) : null, maxPrice: p.max_price ? Number(p.max_price) : null,
        imageUrl: p.image_url,
        commissionCoach: p.commission_coach, commissionLevel1: p.commission_level1,
        commissionLevel2: p.commission_level2, commissionLevel3: p.commission_level3,
        commissionCoachAbsolute: e?.coachCommission ?? null,
        commissionLevel1Absolute: e?.networkL1 ?? null,
        commissionLevel2Absolute: e?.networkL2 ?? null,
        commissionLevel3Absolute: e?.networkL3 ?? null,
        commissionCoachAbsoluteCard: e?.coachCommissionCard ?? null,
        commissionLevel1AbsoluteCard: e?.networkL1Card ?? null,
        commissionLevel2AbsoluteCard: e?.networkL2Card ?? null,
        commissionLevel3AbsoluteCard: e?.networkL3Card ?? null,

        appFee: p.app_fee, appFeePercentage: p.app_fee_percentage,
        cardFeePercentage: p.credit_fee_percentage ?? p.card_fee_percentage,
        taxPercentage: p.tax_percentage, cost: p.cost, otherCosts: p.other_costs,
        creatorCoachId: p.creator_coach_id ?? null,
        pointsPerSale: p.points_per_sale ?? 0,
        hasChallenge: (p.has_challenge_access ?? true) ? true : false,
        cardDays: Number(p.card_access_days || 0),
      });})),
      ...((digital.data || []).map((p: any) => ({
        id: `digital-${p.id}`, sourceId: p.id, title: p.title, description: p.description,
        price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
        category: "Cursos", kind: "digital" as const, tag: p.is_featured ? "Destaque" : "Curso",
        imageUrl: p.cover_url,
      }))),
      ...((physical.data || []).map((p: any) => ({
        id: `store-${p.id}`, sourceId: p.id, title: p.name, description: p.description,
        price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
        category: p.is_herbalife ? "Herbalife" : p.category || "Suplementos",
        kind: "store" as const, tag: p.is_herbalife ? "Herbalife" : undefined, stock: p.stock,
        imageUrl: p.image_url,
      }))),
      ...(((itemsRes.data as unknown as any[]) || []).map((it) => ({
        id: `item-${it.id}`, sourceId: it.id, title: it.name, subtitle: it.short_description, description: it.description,
        price: Number(it.price || 0), originalPrice: it.original_price ? Number(it.original_price) : null,
        category: sectionName(it.section_id), kind: "item" as const,
        sectionId: it.section_id ?? null, categoryId: it.category_id ?? null,
        tag: it.kind === "digital" ? "Digital" : undefined,
        stock: it.kind === "physical" ? it.stock : null, imageUrl: it.image_url,
        commissionCoach: it.commission_coach, commissionLevel1: it.commission_level1,
        commissionLevel2: it.commission_level2, commissionLevel3: it.commission_level3,
        commissionCoachAbsolute: earningsById.get(it.id)?.coachCommission ?? null,
        commissionLevel1Absolute: earningsById.get(it.id)?.networkL1 ?? null,
        commissionLevel2Absolute: earningsById.get(it.id)?.networkL2 ?? null,
        commissionLevel3Absolute: earningsById.get(it.id)?.networkL3 ?? null,
        commissionCoachAbsoluteCard: earningsById.get(it.id)?.coachCommissionCard ?? null,
        commissionLevel1AbsoluteCard: earningsById.get(it.id)?.networkL1Card ?? null,
        commissionLevel2AbsoluteCard: earningsById.get(it.id)?.networkL2Card ?? null,
        commissionLevel3AbsoluteCard: earningsById.get(it.id)?.networkL3Card ?? null,
        appFee: it.app_fee, appFeePercentage: it.app_fee_percentage,
        cardFeePercentage: it.credit_fee_percentage ?? it.card_fee_percentage,
        taxPercentage: it.tax_percentage, cost: it.cost, otherCosts: it.other_costs,
        creatorCoachId: it.creator_coach_id ?? null,
        pointsPerSale: it.points_per_sale ?? 0,
        hasChallenge: !!it.has_challenge_access,
        cardDays: Number(it.card_access_days || 0),
      }))),
      ...(((partnerRows as any[]) || []).map((pp: any) => {
        const specKey = pp.coach?.specialty_key || "other";
        const specLabel = SPECIALTY_LABEL[specKey] || "Outro";
        return {
          id: `partner-${pp.id}`,
          sourceId: pp.id,
          title: pp.name,
          description: pp.description,
          price: Number(pp.price || 0),
          originalPrice: null,
          category: `Parceiros · ${specLabel}`,
          kind: "partner" as const,
          tag: specLabel,
          imageUrl: pp.image_url,
          creatorCoachId: pp.coach?.id ?? null,
          professionalCoachId: pp.coach?.id ?? null,
          isSchedulable: !!pp.is_schedulable,
          defaultDurationMinutes: pp.default_duration_minutes ?? 30,
        };
      })),
    ]);
  };




  const loadCoachData = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!prof) return;
    const { data: coach } = await supabase.from("coaches").select("id").eq("profile_id", prof.id).maybeSingle();
    if (!coach) return;
    const { data: masterFlag } = await supabase.rpc("is_master_coach" as never, { _coach_id: coach.id } as never);
    setIsMasterCoach(!!masterFlag);
    const { data: clientRows, error: clientsError } = await supabase.rpc("list_coach_team_clients" as never);
    if (clientsError) toast.error(clientsError.message || "Erro ao carregar alunos da equipe");
    const normalizedClients = ((clientRows || []) as any[]).map((s) => ({
      id: s.id, name: s.name || "Cliente", email: s.email || null, phone: s.phone || null, cpf: s.cpf || null,
    }));
    setClients(normalizedClients);
    // Não selecionar aluno automaticamente — coach precisa escolher.
    // Sales history (orders for own students or created by this coach)
    const studentIds = normalizedClients.map((s) => s.id);
    const orFilter = [
      studentIds.length ? `student_id.in.(${studentIds.join(",")})` : null,
      `metadata->>created_by_coach_id.eq.${coach.id}`,
    ].filter(Boolean).join(",");
    const { data: orders } = await supabase
      .from("store_orders" as never)
      .select("id, order_number, status, total_amount, created_at, payment_method, student_id, students:student_id(profiles:profile_id(name)), store_order_items(title)" as never)
      .or(orFilter as never)
      .order("created_at" as never, { ascending: false })
      .limit(100);
    setSalesHistory(((orders || []) as any[]).map((o) => ({
      orderId: o.id, orderNumber: o.order_number, status: o.status, total: Number(o.total_amount || 0),
      createdAt: o.created_at, paymentMethod: o.payment_method,
      clientName: o.students?.profiles?.name || "Cliente",
      productTitles: ((o.store_order_items as any[]) || []).map((i) => i.title).join(", ") || "—",
      commissionAmount: 0, commissionStatus: null,
    })));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (coachMode) loadCoachData(); }, [coachMode]);

  // Abre automaticamente o produto vindo do link de indicação (/r/{code}?p=…)
  useEffect(() => {
    if (coachMode) return;
    if (!items.length) return;
    let pendingId: string | null = null;
    try { pendingId = sessionStorage.getItem("fitmind_pending_product"); } catch { /* ignore */ }
    if (!pendingId) return;
    const match = items.find((it) => it.sourceId === pendingId);
    if (match) {
      setDetailProduct(match);
      try { sessionStorage.removeItem("fitmind_pending_product"); } catch { /* ignore */ }
    }
  }, [items, coachMode]);


  useEffect(() => {
    const coachId = detailProduct?.creatorCoachId;
    if (!coachId) { setDetailProfessional(null); return; }
    let cancelled = false;
    (async () => {
      const { data: coach } = await supabase
        .from("coaches")
        .select("profile_id, is_professional")
        .eq("id", coachId)
        .maybeSingle();
      if (!coach?.profile_id || !coach.is_professional) {
        if (!cancelled) setDetailProfessional(null);
        return;
      }
      const [{ data: profile }, { data: pub }] = await Promise.all([
        supabase.from("profiles").select("name, avatar_url").eq("id", coach.profile_id).maybeSingle(),
        supabase.from("professional_public_profile" as never)
          .select("headline,bio_long,instagram,website,services,social_links" as never)
          .eq("profile_id" as never, coach.profile_id as never)
          .maybeSingle(),
      ]);
      if (cancelled || !profile) { if (!cancelled) setDetailProfessional(null); return; }
      const p = (pub as any) || {};
      setDetailProfessional({
        name: (profile as any).name || "Profissional",
        avatarUrl: (profile as any).avatar_url || null,
        headline: p.headline ?? null,
        bioLong: p.bio_long ?? null,
        instagram: p.instagram ?? null,
        website: p.website ?? null,
        services: p.services ?? null,
        socialLinks: Array.isArray(p.social_links) ? p.social_links : [],
      });
    })();
    return () => { cancelled = true; };
  }, [detailProduct]);

  const subcatsOfActive = useMemo(
    () => activeSection ? storeCategories.filter((c) => c.section_id === activeSection.id) : [],
    [activeSection, storeCategories],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeSection) {
        const inSection = item.sectionId === activeSection.id || item.category === activeSection.name;
        if (!inSection) return false;
        if (activeSubcategory && item.categoryId !== activeSubcategory.id) return false;
      }
      if (needle && !item.title.toLowerCase().includes(needle) && !(item.description || "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [activeSection, activeSubcategory, items, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // Sem taxas — total = subtotal. Taxas de cartão são cobradas no checkout/maquininha.
  const total = subtotal;
  const requiresShipping = !coachMode && cart.some((item) => item.kind === "store" || (item.kind === "item" && item.stock !== null && item.stock !== undefined));
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const partnerRpcPaymentMethod = () => paymentMethod === "pix" ? "pix" : "card";
  const priceLabel = (item: StoreProduct) => item.isPriceRange && item.minPrice && item.maxPrice ? `${fmt(item.minPrice)} - ${fmt(item.maxPrice)}` : fmt(item.price);

  const addToCart = (item: StoreProduct) => {
    if ((item.kind === "store" || item.kind === "item") && item.stock !== null && item.stock !== undefined && item.stock <= 0) {
      toast.error("Produto sem estoque.");
      return;
    }
    if (item.isSchedulable && !item.scheduledSlot) {
      toast.error("Escolha um horário antes de adicionar.");
      return;
    }
    setCart((current) => {
      const found = current.find((cartItem) => cartItem.id === item.id);
      // Itens agendáveis: cada compra é única (1 horário por item), não somar quantidade
      if (found && !item.isSchedulable) return current.map((cartItem) => cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem);
      if (found && item.isSchedulable) {
        return current.map((cartItem) => cartItem.id === item.id ? { ...item, quantity: 1 } : cartItem);
      }
      return [...current, { ...item, quantity: 1 }];
    });
    toast.success(item.isSchedulable ? "Horário reservado no carrinho." : "Adicionado ao carrinho.");
    setDetailProduct(null);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item).filter((item) => item.quantity > 0));
  };

  const checkoutAsStudent = async () => {
    if (cart.length === 0) return;
    const partnerItems = cart.filter((c) => c.kind === "partner" || c.kind === "partner_company");
    if (partnerItems.length > 0 && cart.length > 1) {
      toast.error("Produtos de parceiros devem ser comprados separadamente.");
      return;
    }
    if (requiresShipping && (!shipping.name || !shipping.phone || !shipping.address || !shipping.city || !shipping.state)) {
      toast.error("Preencha os dados de entrega.");
      return;
    }
    setCheckingOut(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Caminho exclusivo: produto de parceiro/profissional (1 item por pedido)
      if (partnerItems.length === 1) {
        const pp = partnerItems[0];
        let ppId: string | null = null;
        if (pp.kind === "partner_company") {
          if (!ownStudentId) throw new Error("Conta de aluno não encontrada.");
          const { data, error } = await supabase.rpc("create_partner_company_order" as never, {
            _partner_product_id: pp.sourceId,
            _student_id: ownStudentId,
            _payment_method: partnerRpcPaymentMethod(),
          } as never);
          if (error) throw new Error(error.message);
          ppId = data as unknown as string;
        } else if (pp.isSchedulable && pp.scheduledSlot) {
          const { data, error } = await supabase.rpc("create_scheduled_professional_order" as never, {
            _professional_product_id: pp.sourceId,
            _starts_at: pp.scheduledSlot,
            _payment_method: partnerRpcPaymentMethod(),
          } as never);
          if (error) throw new Error(error.message);
          ppId = data as unknown as string;
        } else if (pp.isSchedulable && !pp.scheduledSlot) {
          throw new Error("Selecione um horário para este atendimento.");
        } else {
          const { data, error: ppErr } = await supabase.rpc("create_partner_product_order" as never, {
            _professional_product_id: pp.sourceId,
            _payment_method: partnerRpcPaymentMethod(),
          } as never);
          if (ppErr) throw new Error(ppErr.message);
          ppId = data as unknown as string;
        }
        if (!ppId) throw new Error("Pedido não retornado");
        const { data: orderData } = await supabase
          .from("partner_product_orders" as never)
          .select("id,order_number,gross_amount" as never)
          .eq("id" as never, ppId as never)
          .maybeSingle();
        const od = orderData as unknown as { id: string; order_number: string; gross_amount: number } | null;
        setCart([]); setCartOpen(false);
        setPayOrder({
          id: od?.id || String(ppId),
          total: Number(od?.gross_amount || pp.price),
          number: od?.order_number || "pedido",
          email: userData.user?.email || "",
          name: userData.user?.user_metadata?.name || "",
          sourceKind: "partner_product_order",
        });
        await load();
        return;
      }

      const payload = cart.map((item) => ({ kind: item.kind, sourceId: item.sourceId, quantity: item.quantity }));
      const { data: orderId, error } = await supabase.rpc("create_store_order" as never, { _items: payload, _payment_method: paymentMethod, _shipping: shipping, _notes: null, _referrer_student_id: pendingReferrerStudentId } as never);
      if (error) throw new Error(error.message);
      if (!orderId) throw new Error("Pedido não retornado");
      const { data: orderData } = await supabase
        .from("store_orders" as never)
        .select("id,order_number,total_amount" as never)
        .eq("id" as never, orderId as never)
        .maybeSingle();
      const od = orderData as unknown as { id: string; order_number: string; total_amount: number } | null;
      setCart([]); setCartOpen(false); setShipping(initialShipping);
      setPayOrder({
        id: od?.id || String(orderId), total: Number(od?.total_amount || total), number: od?.order_number || "pedido",
        email: userData.user?.email || "",
        name: userData.user?.user_metadata?.name || "",
        sourceKind: "store_order",
      });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar pedido");
    } finally {
      setCheckingOut(false);
    }
  };


  const checkoutAsCoach = async () => {
    if (!selectedClient) { setCartOpen(false); setClientPickerOpen(true); return; }
    if (cart.length === 0) return;
    const partnerItems = cart.filter((c) => c.kind === "partner" || c.kind === "partner_company");
    if (partnerItems.length > 0 && cart.length > 1) {
      toast.error("Produtos de parceiros/profissionais devem ser vendidos separadamente.");
      return;
    }
    setCheckingOut(true);
    try {
      // Caminho exclusivo: parceiro/profissional revendido para aluno
      if (partnerItems.length === 1) {
        const pp = partnerItems[0];
        let ppId: string | null = null;
        if (pp.kind === "partner_company") {
          const { data, error } = await supabase.rpc("create_partner_company_order" as never, {
            _partner_product_id: pp.sourceId,
            _student_id: selectedClient.id,
            _payment_method: partnerRpcPaymentMethod(),
          } as never);
          if (error) throw new Error(error.message);
          ppId = data as unknown as string;
        } else if (pp.isSchedulable && pp.scheduledSlot) {
          const { data, error } = await supabase.rpc("create_scheduled_professional_order" as never, {
            _professional_product_id: pp.sourceId,
            _starts_at: pp.scheduledSlot,
            _payment_method: partnerRpcPaymentMethod(),
            _buyer_student_id: selectedClient.id,
          } as never);
          if (error) throw new Error(error.message);
          ppId = data as unknown as string;
        } else if (pp.isSchedulable && !pp.scheduledSlot) {
          throw new Error("Selecione um horário para este atendimento.");
        } else {
          const { data, error: ppErr } = await supabase.rpc("create_partner_product_order" as never, {
            _professional_product_id: pp.sourceId,
            _payment_method: partnerRpcPaymentMethod(),
            _buyer_student_id: selectedClient.id,
          } as never);
          if (ppErr) throw new Error(ppErr.message);
          ppId = data as unknown as string;
        }
        if (!ppId) throw new Error("Pedido não retornado");
        const { data: orderData } = await supabase
          .from("partner_product_orders" as never)
          .select("id,order_number,gross_amount" as never)
          .eq("id" as never, ppId as never)
          .maybeSingle();
        const od = orderData as unknown as { id: string; order_number: string; gross_amount: number } | null;
        setCart([]); setCartOpen(false);
        setPayOrder({
          id: od?.id || String(ppId),
          total: Number(od?.gross_amount || pp.price),
          number: od?.order_number || "pedido",
          email: selectedClient.email || "",
          name: selectedClient.name,
          sourceKind: "partner_product_order",
        });
        toast.success("Venda criada. Finalize o pagamento.");
        loadCoachData();
        return;
      }

      const items = cart.map((c) => ({
        productId: c.sourceId,
        kind: c.kind,
        title: c.title,
        unitPrice: c.price,
        quantity: c.quantity,
        itemKind: c.kind === "item" ? (c.stock === null || c.stock === undefined ? "digital" : "physical") : undefined,
      }));
      const { data: res, error: rpcErr } = await supabase.rpc("create_coach_sale" as never, {
        _client_id: selectedClient.id,
        _items: items,
        _payment_method: paymentMethod,
        _notes: null,
      } as never);
      if (rpcErr) throw new Error(rpcErr.message);
      const row = (Array.isArray(res) ? res[0] : res) as { order_id?: string; orderId?: string; order_number?: string; orderNumber?: string; total?: number; total_amount?: number } | null;
      const orderId = row?.order_id || row?.orderId;
      const orderNumber = row?.order_number || row?.orderNumber || "pedido";
      if (!orderId) throw new Error("Pedido não retornado pelo servidor");
      setCart([]); setCartOpen(false);
      setPayOrder({
        id: orderId, total: Number(row?.total ?? row?.total_amount ?? total), number: orderNumber,
        email: selectedClient.email || "", name: selectedClient.name,
        sourceKind: "store_order",
      });
      toast.success("Venda criada. Finalize o pagamento.");
      loadCoachData();
    } catch (e: any) {
      console.error("[coach checkout error]", e);
      toast.error(e?.message || "Erro ao registrar venda");
    } finally {
      setCheckingOut(false);
    }
  };

  const checkout = coachMode ? checkoutAsCoach : checkoutAsStudent;



  const tabsBar = (
    <div className="flex gap-2 rounded-full bg-card p-1">
      {([
        { id: "fitmind", label: "FitMind" },
        { id: "partner", label: "Parceiros" },
        { id: "professional", label: "Profissionais" },
      ] as const).map((t) => (
        <button key={t.id} onClick={() => setStoreTab(t.id)} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${storeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );

  if (storeTab !== "fitmind") {
    const addPartnerProductToCart = (item: { id: string; name: string; description: string | null; image_url: string | null; price: number; section_id: string | null; category_id: string | null; seller: string; kind: "partner" | "professional"; isSchedulable?: boolean; professionalCoachId?: string | null; durationMinutes?: number; scheduledSlot?: string | null }) => {
      const cartKind: ProductKind = item.kind === "partner" ? "partner_company" : "partner";
      const cartItem: StoreProduct = {
        id: `${cartKind}-${item.id}`,
        sourceId: item.id,
        title: item.name,
        description: item.description,
        price: item.price,
        category: item.seller,
        kind: cartKind,
        tag: item.seller,
        imageUrl: item.image_url,
        creatorCoachId: item.professionalCoachId ?? null,
        professionalCoachId: item.professionalCoachId ?? null,
        isSchedulable: !!item.isSchedulable,
        defaultDurationMinutes: item.durationMinutes ?? 30,
        scheduledSlot: item.scheduledSlot ?? null,
      };
      // Apenas 1 produto de parceiro/profissional por pedido — substitui o atual
      setCart([{ ...cartItem, quantity: 1 }]);
      setCartOpen(true);
    };

    return (
      <div className="flex flex-col gap-4 p-4 pb-6">
        <header className="flex items-center justify-between pt-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p>
            <h1 className="text-2xl font-bold text-foreground">{storeTab === "partner" ? "Produtos de Parceiros" : "Produtos de Profissionais"}</h1>
          </div>
          <button onClick={() => setCartOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
          </button>
        </header>
        {tabsBar}
        {coachMode && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Selecione seu aluno</p>
            <button
              onClick={() => setClientPickerOpen(true)}
              className="flex w-full items-center justify-between rounded-xl bg-card px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <UserRound className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedClient?.name || "Selecione seu aluno"}</p>
                  {selectedClient?.email && <p className="text-[11px] text-muted-foreground">{selectedClient.email}</p>}
                  {selectedClient?.cpf && <p className="text-[11px] text-muted-foreground">CPF: {selectedClient.cpf}</p>}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
        <PartnerProfessionalStore
          kind={storeTab}
          mode={coachMode ? "reseller" : "student"}
          resellerStudent={coachMode && selectedClient ? { id: selectedClient.id, name: selectedClient.name, email: selectedClient.email } : null}
          onAddToCart={addPartnerProductToCart}
        />
        {clientPickerOpen && (
          <ClientPickerModal
            clients={clients}
            isMaster={isMasterCoach}
            onPick={(c) => { setSelectedClient(c); setClientPickerOpen(false); }}
            onClose={() => setClientPickerOpen(false)}
          />
        )}
        {cartOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15"><Sparkles className="h-5 w-5 text-primary" /></div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Carrinho</h2>
                  <p className="text-xs text-muted-foreground">{cart.length} itens no pedido</p>
                </div>
              </div>
              {coachMode && (
                <div className="mb-3 rounded-xl bg-muted p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</p>
                  {selectedClient ? (
                    <button onClick={() => { setCartOpen(false); setClientPickerOpen(true); }} className="mt-1 flex w-full items-center justify-between text-left">
                      <p className="text-sm font-bold text-foreground">{selectedClient.name}</p>
                      <span className="text-[10px] font-bold text-primary">Trocar</span>
                    </button>
                  ) : (
                    <button onClick={() => { setCartOpen(false); setClientPickerOpen(true); }} className="mt-1 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                      <UserRound className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-primary">Selecionar aluno →</span>
                    </button>
                  )}
                </div>
              )}
              {cart.length === 0 ? (
                <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl bg-muted p-3">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-foreground">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{fmt(item.price)}</p>
                        {item.scheduledSlot && <p className="text-[10px] text-primary">📅 {new Date(item.scheduledSlot).toLocaleString("pt-BR")}</p>}
                      </div>
                      <button onClick={() => setCart((c) => c.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="my-4 grid grid-cols-3 gap-2">
                {(["pix", "credit_card", "debit_card"] as PaymentMethod[]).map((method) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-xl px-2 py-2 text-xs font-bold ${paymentMethod === method ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {method === "pix" ? "PIX" : method === "credit_card" ? "Crédito" : "Débito"}
                  </button>
                ))}
              </div>
              <div className="mb-4 rounded-xl bg-muted p-3 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><b className="text-primary">{fmt(total)}</b></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCartOpen(false)} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground">Fechar</button>
                <button
                  onClick={() => {
                    if (coachMode && !selectedClient) { setCartOpen(false); setClientPickerOpen(true); }
                    else checkout();
                  }}
                  disabled={checkingOut || cart.length === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" /> {checkingOut ? "Processando..." : (coachMode && !selectedClient ? "Selecionar Aluno →" : "Finalizar")}
                </button>
              </div>
            </div>
          </div>
        )}
        {payOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">Pagamento</h2>
                  <p className="text-xs text-muted-foreground">Pedido {payOrder.number}</p>
                </div>
                <button onClick={() => setPayOrder(null)} className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground">Fechar</button>
              </div>
              <MercadoPagoCheckout
                source={{ kind: payOrder.sourceKind, id: payOrder.id }}
                amount={payOrder.total}
                description={`Pedido ${payOrder.number}`}
                defaultPayer={{ email: payOrder.email, name: payOrder.name }}
                initialMethod={paymentMethod === "pix" ? "pix" : "card"}
                onApproved={() => { toast.success("Pagamento aprovado!"); setPayOrder(null); }}
              />
              {coachMode && (() => {
                const payLink = `${window.location.origin}/pay/${payOrder.number}`;
                const clientPhone = selectedClient?.phone?.replace(/\D/g, "") || "";
                const waMsg = encodeURIComponent(
                  `Olá ${selectedClient?.name || ""}! Segue o link para finalizar seu pagamento:\n\n${payLink}`,
                );
                const waUrl = clientPhone
                  ? `https://wa.me/55${clientPhone}?text=${waMsg}`
                  : `https://wa.me/?text=${waMsg}`;
                return (
                  <div className="mt-4 space-y-3 rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Link de pagamento do cliente
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
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
                      {clientPhone ? `Enviar pelo WhatsApp para ${selectedClient?.name}` : "Enviar pelo WhatsApp"}
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      {tabsBar}
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p>
          <h1 className="text-2xl font-bold text-foreground">FitMind Club Store</h1>
        </div>
        <div className="flex items-center gap-2">
          {coachMode && (
            <button onClick={() => setShowHistory((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-3 text-[10px] font-bold text-foreground">
              <History className="h-3.5 w-3.5 text-primary" /> Histórico ({salesHistory.length})
            </button>
          )}
          <button onClick={() => setCartOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
          </button>
        </div>
      </header>

      {coachMode && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Selecione seu aluno</p>
          <button
            onClick={() => setClientPickerOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-card px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-bold text-foreground">{selectedClient?.name || "Selecione seu aluno"}</p>
                {selectedClient?.email && <p className="text-[11px] text-muted-foreground">{selectedClient.email}</p>}
                {selectedClient?.cpf && <p className="text-[11px] text-muted-foreground">CPF: {selectedClient.cpf}</p>}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {coachMode && showHistory && (
        <div className="rounded-2xl bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">Minhas vendas</h2>
          {salesHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma venda registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {salesHistory.map((s) => (
                <div key={s.orderId} className="rounded-xl bg-muted p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">{s.clientName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${s.status === "paid" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{s.productTitles}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{s.createdAt ? new Date(s.createdAt).toLocaleDateString("pt-BR") : ""}</span>
                    <div className="flex gap-3">
                      <span className="text-foreground">{fmt(s.total)}</span>
                      <span className="font-bold text-primary">+{fmt(s.commissionAmount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produtos..." className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
      </div>

      {(activeSection || activeSubcategory) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => { setActiveSection(null); setActiveSubcategory(null); }} className="rounded-full bg-card px-3 py-1.5 font-bold text-foreground">← Loja</button>
          {activeSection && (
            <button onClick={() => setActiveSubcategory(null)} className="rounded-full bg-primary/15 px-3 py-1.5 font-bold text-primary">{activeSection.name}</button>
          )}
          {activeSubcategory && (
            <span className="rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground">{activeSubcategory.name}</span>
          )}
        </div>
      )}

      {!activeSection && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {storeSections.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSection(s); setActiveSubcategory(null); }}
              className="overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
              style={{ width: s.card_width ? `${s.card_width}px` : undefined, height: s.card_height ? `${s.card_height}px` : undefined }}
            >
              {s.image_url ? (
                <img src={s.image_url} alt={s.name} className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-muted"><ShoppingBag className="h-8 w-8 text-muted-foreground" /></div>
              )}
              <p className="px-3 py-2 text-sm font-bold text-foreground">{s.name}</p>
            </button>
          ))}
        </div>
      )}

      {activeSection && !activeSubcategory && subcatsOfActive.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {subcatsOfActive.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveSubcategory(c)}
              className="overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
              style={{ width: c.card_width ? `${c.card_width}px` : undefined, height: c.card_height ? `${c.card_height}px` : undefined }}
            >
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-muted"><ShoppingBag className="h-7 w-7 text-muted-foreground" /></div>
              )}
              <p className="px-3 py-2 text-sm font-bold text-foreground">{c.name}</p>
            </button>
          ))}
        </div>
      )}

      {!coachMode && !activeSection && orders.length > 0 && (
        <section className="rounded-2xl bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">Meus pedidos</h2>
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-foreground">{order.order_number}</p>
                  <p className="text-[10px] text-muted-foreground">{order.status} · {order.created_at ? new Date(order.created_at).toLocaleDateString("pt-BR") : ""}</p>
                </div>
                <span className="text-xs font-bold text-primary">{fmt(Number(order.total_amount || 0))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection && (subcatsOfActive.length === 0 || activeSubcategory) && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => (
            <div key={item.id} className="relative">
              <button onClick={() => setDetailProduct(item)} className="w-full rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent">
                <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <ShoppingBag className="h-8 w-8 text-muted-foreground" />}
                </div>
                {item.tag && <span className="mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">{item.tag}</span>}
                <p className="min-h-[32px] text-xs font-medium text-foreground line-clamp-2">{item.title}</p>
                {item.subtitle && <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{item.subtitle}</p>}
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <span className="text-sm font-bold text-foreground">{priceLabel(item)}</span>
                  {item.originalPrice && <span className="text-[10px] text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}
                </div>
                {(item.kind === "store" || item.kind === "item") && item.stock !== null && item.stock !== undefined && (
                  <p className="mt-1 text-[10px] text-muted-foreground">Estoque: {item.stock}</p>
                )}
                {item.hasChallenge && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    🔥 Acesso a 1 desafio
                  </span>
                )}
                {(item.cardDays ?? 0) > 0 && (
                  <span className="mt-2 ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                    🪪 {item.cardDays}d carteirinha
                  </span>
                )}
                {coachMode && (item.pointsPerSale ?? 0) > 0 && (
                  <span className="mt-2 ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                    🏆 +{item.pointsPerSale} pts
                  </span>
                )}
              </button>
              {!coachMode && myReferralCode && indicableProductIds.has(item.sourceId) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyReferralLink(item.sourceId); }}
                  title="Copiar link de indicação"
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">Nenhum produto nessa categoria ainda.</p>
          )}
        </div>
      )}



      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => { setDetailProduct(null); setDetailProfessional(null); }}
          onAdd={(p) => addToCart(p as StoreProduct)}
          showCommissions={coachMode}
          hasUpline={hasUpline}
          addLabel={coachMode ? "Adicionar à venda" : "Adicionar ao carrinho"}
          professional={detailProfessional}
        />
      )}

      {clientPickerOpen && (
        <ClientPickerModal
          clients={clients}
          isMaster={isMasterCoach}
          onPick={(c) => { setSelectedClient(c); setClientPickerOpen(false); }}
          onClose={() => setClientPickerOpen(false)}
        />
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15"><Sparkles className="h-5 w-5 text-primary" /></div>
              <div>
                <h2 className="text-base font-bold text-foreground">Carrinho</h2>
                <p className="text-xs text-muted-foreground">{cart.length} itens no pedido</p>
              </div>
            </div>
            {coachMode && (
              <div className="mb-3 rounded-xl bg-muted p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</p>
                {selectedClient ? (
                  <button
                    onClick={() => { setCartOpen(false); setClientPickerOpen(true); }}
                    className="mt-1 flex w-full items-center justify-between text-left"
                  >
                    <p className="text-sm font-bold text-foreground">{selectedClient.name}</p>
                    <span className="text-[10px] font-bold text-primary">Trocar</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setCartOpen(false); setClientPickerOpen(true); }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2"
                  >
                    <UserRound className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold text-primary">Selecionar aluno →</span>
                  </button>
                )}
              </div>
            )}
            {cart.length === 0 ? (
              <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl bg-muted p-3">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-foreground">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(item.price)} cada</p>
                    </div>
                    <button onClick={() => updateQty(item.id, -1)}><Minus className="h-4 w-4 text-muted-foreground" /></button>
                    <span className="w-5 text-center text-xs font-bold text-foreground">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)}><Plus className="h-4 w-4 text-primary" /></button>
                    <button onClick={() => setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="my-4 grid grid-cols-3 gap-2">
              {(["pix", "credit_card", "debit_card"] as PaymentMethod[]).map((method) => (
                <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-xl px-2 py-2 text-xs font-bold ${paymentMethod === method ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {method === "pix" ? "PIX" : method === "credit_card" ? "Crédito" : "Débito"}
                </button>
              ))}
            </div>
            {requiresShipping && (
              <div className="mb-4 grid gap-2">
                <p className="text-xs font-bold text-foreground">Entrega</p>
                {(["name", "phone", "zip", "address", "city", "state"] as const).map((field) => (
                  <input key={field} value={shipping[field]} onChange={(event) => setShipping((current) => ({ ...current, [field]: event.target.value }))} placeholder={{ name: "Nome", phone: "Telefone", zip: "CEP", address: "Endereço", city: "Cidade", state: "UF" }[field]} className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                ))}
              </div>
            )}
            <div className="mb-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><b className="text-foreground">{fmt(subtotal)}</b></div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-bold"><span>Total</span><b className="text-primary">{fmt(total)}</b></div>
              <p className="mt-1 text-[10px] text-muted-foreground">* Taxas de cartão são aplicadas diretamente no checkout/maquininha.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCartOpen(false)} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground">Fechar</button>
              <button
                onClick={() => {
                  if (coachMode && !selectedClient) {
                    setCartOpen(false);
                    setClientPickerOpen(true);
                  } else {
                    checkout();
                  }
                }}
                disabled={checkingOut || cart.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" /> {checkingOut ? "Processando..." : (coachMode && !selectedClient ? "Selecionar Aluno →" : "Finalizar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {payOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">Pagamento</h2>
                <p className="text-xs text-muted-foreground">Pedido {payOrder.number}</p>
              </div>
              <button onClick={() => setPayOrder(null)} className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground">Fechar</button>
            </div>
            <MercadoPagoCheckout
              source={{ kind: payOrder.sourceKind, id: payOrder.id }}

              amount={payOrder.total}
              description={`Pedido ${payOrder.number}`}
              defaultPayer={{ email: payOrder.email, name: payOrder.name }}
              initialMethod={paymentMethod === "pix" ? "pix" : "card"}
              onApproved={() => { toast.success("Pagamento aprovado!"); setPayOrder(null); load(); if (coachMode) loadCoachData(); }}
            />
            {coachMode && (() => {
              const payLink = `${window.location.origin}/pay/${payOrder.number}`;
              const clientPhone = selectedClient?.phone?.replace(/\D/g, "") || "";
              const waMsg = encodeURIComponent(
                `Olá ${selectedClient?.name || ""}! Segue o link para finalizar seu pagamento:\n\n${payLink}`
              );
              const waUrl = clientPhone
                ? `https://wa.me/55${clientPhone}?text=${waMsg}`
                : `https://wa.me/?text=${waMsg}`;
              return (
                <div className="mt-4 space-y-3 rounded-xl bg-muted p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Link de pagamento do cliente
                  </p>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
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
                    {clientPhone ? `Enviar pelo WhatsApp para ${selectedClient?.name}` : "Enviar pelo WhatsApp (sem telefone)"}
                  </a>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientPickerModal({
  clients, isMaster, onPick, onClose,
}: {
  clients: SaleClient[];
  isMaster?: boolean;
  onPick: (c: SaleClient) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [allResults, setAllResults] = useState<SaleClient[]>([]);
  const [searching, setSearching] = useState(false);
  const onlyDigits = (s: string) => s.replace(/\D/g, "");

  const filteredMine = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    const termDigits = onlyDigits(term);
    return clients.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(term);
      const cpfMatch = termDigits.length > 0 && c.cpf && onlyDigits(c.cpf).includes(termDigits);
      return nameMatch || cpfMatch;
    });
  }, [clients, q]);

  // Master Coach: search across all students on demand
  useEffect(() => {
    if (!isMaster || tab !== "all") return;
    const handle = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc("list_all_students_for_master" as never, { _q: q } as never);
      setSearching(false);
      if (error) { toast.error(error.message || "Erro na busca"); return; }
      setAllResults(((data || []) as any[]).map((s) => ({
        id: s.id, name: s.name || "Cliente", email: s.email || null, phone: s.phone || null, cpf: s.cpf || null,
      })));
    }, 250);
    return () => clearTimeout(handle);
  }, [isMaster, tab, q]);

  const list = tab === "all" ? allResults : filteredMine;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-bold text-foreground">Selecione o aluno</h2>
        {isMaster && (
          <div className="mb-3 flex rounded-lg bg-muted p-0.5">
            <button onClick={() => setTab("mine")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Meus clientes
            </button>
            <button onClick={() => setTab("all")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${tab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Todos os clientes
            </button>
          </div>
        )}
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "all" ? "Buscar por nome, CPF ou e-mail..." : "Buscar por nome ou CPF..."}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        {tab === "mine" && clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não tem alunos vinculados.</p>
        ) : tab === "all" && searching ? (
          <p className="text-sm text-muted-foreground">Buscando...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === "all" && !q ? "Digite para buscar entre todos os alunos." : "Nenhum aluno encontrado."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {list.map((c) => (
              <button key={c.id} onClick={() => onPick(c)} className="w-full rounded-xl bg-muted p-3 text-left hover:bg-accent">
                <p className="text-sm font-bold text-foreground">{c.name}</p>
                {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                {c.cpf && <p className="text-[11px] text-muted-foreground">CPF: {c.cpf}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
