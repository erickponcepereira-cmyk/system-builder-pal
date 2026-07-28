import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Building2, Package, Image as ImageIcon, QrCode, UserCog, LogOut, Plus, Loader2, AlertTriangle, Check, X, Trash2, Save, DollarSign, Gift, ShoppingBag, Users, Copy, Share2, TrendingUp, CalendarDays, Wallet, BarChart3, Clock, CreditCard, Eye, ShieldCheck } from "lucide-react";
import { CollabWorkspace } from "@/components/shared/CollabWorkspace";
import { useServerFn } from "@tanstack/react-start";
import { getCollabPendingCounts, listCoproducedProducts } from "@/lib/collab.functions";

import { CoproductionEditor } from "@/components/shared/CoproductionEditor";
import { ProductDownloadsManager } from "@/components/admin/ProductDownloadsManager";

import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { MyNetworkPanel } from "@/components/MyNetworkPanel";
import { maskPhone } from "@/lib/masks";
import { computeFromCharge, computeFromReceive, COACH_COMMISSION_OPTIONS, type CoachCommissionPct, type PartnerPriceMode } from "@/lib/partnerFinance";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import { CoachBenefitsTab } from "@/components/coach/tabs/BenefitsTab";
import { StorePage } from "@/components/student/StorePage";
import { FitmindCalendar } from "@/components/FitmindCalendar";
import { CategoryPicker } from "@/components/store/CategoryPicker";
import { ProductImageGallery } from "@/components/ui/ProductImageGallery";
import { useImageCrop } from "@/components/ui/ImageCropProvider";

import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PartnerWalletTab } from "@/components/partner/PartnerWalletTab";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { ImageCropperDialog } from "@/components/ui/ImageCropperDialog";
import { SubscriptionGuard } from "@/components/profile/SubscriptionGuard";
import { PartnerOnboardingGate } from "@/components/partner/PartnerOnboardingGate";
import { AnnualActivationCard } from "@/components/profile/AnnualActivationCard";
import { NetworkTreeTab } from "@/components/coach/tabs/NetworkTreeTab";
import type { CoachContext } from "@/routes/_authenticated/coach";
import { PartnerReports } from "@/components/partner/PartnerReports";
import { PartnerFreebieScanner } from "@/components/partner/PartnerFreebieScanner";
import { PartnerFreebieScheduleEditor } from "@/components/partner/PartnerFreebieScheduleEditor";
import { PartnerMembersPanel } from "@/components/partner/PartnerMembersPanel";
import { NovaUnidadeDialog } from "@/components/partner/NovaUnidadeDialog";

import { carregarUnidades, escolherUnidadeAtiva, lembrarUnidadeAtiva, pode, type Permissao, type Unidade } from "@/lib/unidades-parceiro";




export const Route = createFileRoute("/_authenticated/partner")({
  head: () => ({ meta: [{ title: "Painel Parceiro — FitMind Club" }] }),
  // Sessão é garantida pelo layout pai _authenticated (ssr:false, client-side).
  component: PartnerPanel,
});

type Tab = "overview" | "products" | "timeline" | "qrcode" | "freebies" | "store" | "collaborators" | "network" | "wallet" | "subscription" | "annual" | "profile" | "fitmind_calendar" | "reports" | "scanner" | "collab" | "members";


interface Partner {
  id: string; profile_id: string; fantasy_name: string; description: string | null;
  photo_url: string | null; cover_url: string | null; whatsapp: string | null;
  public_whatsapp: string | null;
  instagram: string | null; facebook: string | null; website: string | null;
  address: string | null; city: string | null; state: string | null;
  status: string; document: string | null; document_type: string | null;
  business_area: string | null; specialty: string | null;
  referral_code: string | null; referral_link: string | null;
  free_redeem_policy?: "all" | "one_per_month" | null;
}

interface Product {
  id: string; partner_id: string; kind: "free" | "paid"; name: string;
  description: string | null; image_url: string | null; image_urls?: string[] | null; price: number; stock: number | null;
  original_price?: number | null;
  redemption_instructions: string | null; status: string; admin_notes: string | null;
  is_active_by_partner: boolean;
  redemption_mode?: "free" | "discount";
  discount_percent?: number | null;
  estimated_value?: number | null;
  price_input_mode?: "charge" | "receive";
  coach_commission_percentage?: number;
  partner_net_amount?: number;
  coach_commission_amount?: number;
  network_l1_amount?: number;
  network_l2_amount?: number;
  network_l3_amount?: number;
  section_id?: string | null;
  category_id?: string | null;
  benefit_start_time?: string | null;
  benefit_end_time?: string | null;
  monthly_redeem_limit?: number | null;
  weekly_limit_per_student?: number | null;
  uses_scheduling?: boolean | null;
  event_date?: string | null;
  event_capacity?: number | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  redemption_location_name?: string | null;
  redemption_location_url?: string | null;
  sort_order?: number | null;
  is_physical?: boolean;
  delivery_days?: number | null;
  is_mirrored?: boolean;
  mirror_source_product_id?: string | null;
}


interface Post { id: string; image_url: string; caption: string | null; created_at: string; }

function formatBenefitWindow(start?: string | null, end?: string | null) {
  const fmt = (value?: string | null) => value ? value.slice(0, 5) : null;
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `Disponível das ${s} às ${e}`;
  if (s) return `Disponível a partir das ${s}`;
  if (e) return `Disponível até ${e}`;
  return null;
}

function PartnerPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [novaUnidadeOpen, setNovaUnidadeOpen] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(() => {
    try { return localStorage.getItem("fitmind_seletor_unidades") !== "0"; } catch { return true; }
  });


  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visits, setVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [otherRoles, setOtherRoles] = useState<{ admin: boolean; coach: boolean; student: boolean }>({ admin: false, coach: false, student: false });
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);

  const [collabPending, setCollabPending] = useState(0);
  const getCollabCounts = useServerFn(getCollabPendingCounts);

  useEffect(() => {
    if (!partner?.id) return;
    let alive = true;
    const load = () => getCollabCounts({ data: { entityType: "partner", entityId: partner.id } })
      .then((r) => { if (alive) setCollabPending(r.total); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [partner?.id]);

  const load = async (alvoPartnerId?: string) => {

    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      navigate({ to: "/login" }); return;
    }
    const { data: profile } = await supabase.from("profiles").select("id, role").eq("user_id", userData.user.id).maybeSingle();
    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);

    const lista = await carregarUnidades(profile.id);
    setUnidades(lista);

    const ativa = escolherUnidadeAtiva(lista, alvoPartnerId ?? unidadeAtiva?.partnerId ?? null);
    if (!ativa) { setUnidadeAtiva(null); setPartner(null); setLoading(false); return; }
    setUnidadeAtiva(ativa);
    lembrarUnidadeAtiva(ativa.partnerId);

    const { data: p } = await supabase
      .from("partners" as never)
      .select("id, profile_id, fantasy_name, description, photo_url, cover_url, whatsapp, public_whatsapp, instagram, facebook, website, address, city, state, status, document, document_type, business_area, specialty, referral_code, referral_link, free_redeem_policy" as never)
      .eq("id" as never, ativa.partnerId as never)
      .maybeSingle();
    if (!p) { setLoading(false); return; }
    const pt = p as unknown as Partner;
    setPartner(pt);
    const [pr, ps, v, coach, student] = await Promise.all([
      supabase.from("partner_products" as never).select("*").eq("partner_id" as never, pt.id).is("deleted_at" as never, null as never).order("sort_order" as never, { ascending: true } as never).order("created_at" as never, { ascending: false }),
      supabase.from("partner_posts" as never).select("*").eq("partner_id" as never, pt.id).order("created_at" as never, { ascending: false }).limit(30),
      supabase.from("partner_visits" as never).select("id" as never, { count: "exact", head: true }).eq("partner_id" as never, pt.id),
      supabase.from("coaches").select("id, referral_code, upline_coach_id").eq("profile_id", profile.id).maybeSingle(),
      supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
    ]);
    setProducts((pr.data as unknown as Product[]) || []);
    setPosts((ps.data as unknown as Post[]) || []);
    setVisits(v.count || 0);
    setOtherRoles({ admin: profile.role === "admin", coach: !!coach.data, student: !!student.data });
    if (coach.data) {
      const c = coach.data as { id: string; referral_code: string | null; upline_coach_id: string | null };
      setCoachCtx({
        profileId: profile.id,
        coachId: c.id,
        name: pt.fantasy_name,
        email: "",
        phone: pt.whatsapp || "",
        city: pt.city || "",
        state: pt.state || "",
        bio: "",
        avatarUrl: pt.photo_url,
        patent: null,
        referralCode: c.referral_code || "",
        referralLink: c.referral_code ? `${window.location.origin}/r/${c.referral_code}` : "",
        uplineCoachId: c.upline_coach_id,
        totalActiveStudents: 0,
        totalSales: 0,
      });
    }
    setLoading(false);
  };


  useEffect(() => { load(); }, []);

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); };
  const switchTo = (path: "/admin" | "/coach" | "/student") => {
    if (path === "/student") sessionStorage.setItem("fitmind_selected_area", "student");
    else sessionStorage.removeItem("fitmind_selected_area");
    navigate({ to: path });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!partner) return <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: "#0A0A0A" }}>Cadastro de parceiro não encontrado.</div>;

  const hasActiveFree = products.some(p => p.kind === "free" && p.status === "approved" && p.is_active_by_partner);
  const pendingCount = products.filter(p => p.status === "pending").length;

  const PERMISSAO_DA_ABA: Record<Tab, Permissao> = {
    overview: "overview.ver",
    products: "products.editar",
    scanner: "scanner.usar",
    timeline: "timeline.editar",
    qrcode: "overview.ver",
    freebies: "freebies.editar",
    store: "store.ver",
    network: "network.ver",
    wallet: "wallet.ver",
    subscription: "subscription.ver",
    annual: "subscription.ver",
    reports: "reports.ver",
    fitmind_calendar: "agenda.ver",
    collaborators: "members.gerenciar",
    collab: "collab.ver",
    profile: "profile.editar",
    members: "members.gerenciar",
  };

  const baseTabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "overview", label: "Início", icon: Building2 },
    { key: "products", label: "Produtos", icon: Package },
    { key: "scanner", label: "Scanner", icon: QrCode },
    { key: "timeline", label: "Timeline", icon: ImageIcon },
    { key: "qrcode", label: "QR", icon: QrCode },
  ];
  const benefitTabs: { key: Tab; label: string; icon: typeof Building2 }[] = hasActiveFree ? [
    { key: "freebies", label: "Gratuitos", icon: Gift },
    { key: "store", label: "Loja", icon: ShoppingBag },
  ] : [];
  const tabs = [
    ...baseTabs,
    ...benefitTabs,
    { key: "network" as Tab, label: "Rede", icon: TrendingUp },
    { key: "wallet" as Tab, label: "Carteira", icon: Wallet },
    { key: "subscription" as Tab, label: "Mensalidade", icon: DollarSign },
    { key: "annual" as Tab, label: "Anuidade", icon: CreditCard },
    { key: "reports" as Tab, label: "Relatórios", icon: BarChart3 },
    { key: "fitmind_calendar" as Tab, label: "Agenda", icon: CalendarDays },
    { key: "collaborators" as Tab, label: "Colaboradores", icon: Users },
    { key: "collab" as Tab, label: "Colaboração", icon: Share2 },
    { key: "members" as Tab, label: "Membros", icon: ShieldCheck },
    { key: "profile" as Tab, label: "Perfil", icon: UserCog },
  ].filter((t) => pode(unidadeAtiva, PERMISSAO_DA_ABA[t.key]));

  // Só quem é dono de alguma unidade pode abrir outra academia no mesmo login
  const podeCriarUnidade = !!profileId && unidades.some((u) => u.papel === "owner");



  const abaAtiva: Tab = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? "overview");

  // Membro de equipe (gerente/recepção) não passa pelos gates de anuidade/mensalidade:
  // pagamento e aprovação são responsabilidade do dono da unidade.
  const ehDonoDeAlguma = unidades.some((u) => u.papel === "owner");

  if (!ehDonoDeAlguma && tabs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="max-w-sm space-y-2">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <p className="text-white font-bold">Sem permissões nesta unidade</p>
          <p className="text-sm text-white/50">
            Você faz parte da equipe de {unidadeAtiva?.fantasyName || "uma unidade"}, mas ainda não tem nenhuma aba liberada.
            Peça ao dono para liberar seus acessos em Membros.
          </p>
          <button onClick={() => switchTo("/student")} className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white">Ir para o painel de aluno</button>
        </div>
      </div>
    );
  }

  const conteudo = (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      <header
        className="border-b border-white/5 px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: "#111",
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold text-white">{partner.fantasy_name}</p>
            <p className="text-[10px] text-white/40">Status: <span className={partner.status === "approved" ? "text-green-400" : "text-yellow-400"}>{partner.status}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher current="partner" />
          <button onClick={signOut} className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-white/60 hover:text-white touch-manipulation"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      {(unidades.length > 1 || podeCriarUnidade) && (
        seletorAberto ? (
          <div className="border-b border-white/5 px-4 py-2" style={{ backgroundColor: "#141414" }}>
            <div className="flex gap-2 overflow-x-auto">
              {unidades.map((u) => (
                <button
                  key={u.partnerId}
                  onClick={() => { setTab("overview"); load(u.partnerId); }}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 min-w-[160px] text-left ${u.partnerId === unidadeAtiva?.partnerId ? "bg-primary/15 border border-primary/40" : "bg-white/5 border border-white/10"}`}
                >
                  {u.photoUrl ? (
                    <img src={u.photoUrl} alt={u.fantasyName} className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white text-xs font-bold">{u.fantasyName.charAt(0)}</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{u.fantasyName}</p>
                    <p className="text-[10px] text-white/40 truncate">{[u.city, u.state].filter(Boolean).join(" · ") || (u.papel === "owner" ? "Dono" : u.papel === "manager" ? "Gerente" : "Equipe")}</p>
                  </div>
                </button>
              ))}
              {podeCriarUnidade && (
                <button
                  onClick={() => setNovaUnidadeOpen(true)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 min-w-[150px] text-left bg-white/5 border border-dashed border-white/20 text-white/70 hover:text-white"
                >
                  <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center"><Plus className="h-4 w-4" /></div>
                  <p className="text-xs font-semibold">Nova unidade</p>
                </button>
              )}
            </div>
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => { setSeletorAberto(false); try { localStorage.setItem("fitmind_seletor_unidades", "0"); } catch { /* ignora */ } }}
                className="rounded-lg bg-primary/15 border border-primary/40 px-3 py-1 text-[11px] font-semibold text-primary"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <div className="border-b border-white/5 px-4 py-2 flex items-center justify-between gap-2" style={{ backgroundColor: "#141414" }}>
            <p className="text-[11px] text-white/50 truncate">
              Unidade ativa: <span className="text-white font-semibold">{unidadeAtiva?.fantasyName || partner.fantasy_name}</span>
            </p>
            <button
              onClick={() => { setSeletorAberto(true); try { localStorage.setItem("fitmind_seletor_unidades", "1"); } catch { /* ignora */ } }}
              className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1 text-[11px] font-semibold text-white/70 hover:text-white"
            >
              Trocar / nova unidade
            </button>
          </div>
        )
      )}


      {profileId && (
        <NovaUnidadeDialog
          profileId={profileId}
          open={novaUnidadeOpen}
          onOpenChange={setNovaUnidadeOpen}
          onCreated={(id) => { setTab("overview"); load(id); }}
        />
      )}


      {partner.status !== "approved" && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-xs text-yellow-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Sua empresa aguarda aprovação do admin. Você já pode preencher o perfil e cadastrar produtos.
        </div>
      )}

      <main className="px-4 py-4 pb-24 max-w-3xl mx-auto">
        {abaAtiva === "overview" && <Overview partner={partner} products={products} visits={visits} hasActiveFree={hasActiveFree} pendingCount={pendingCount} coachReferralCode={coachCtx?.referralCode ?? null} />}
        {abaAtiva === "products" && <ProductsPanel partner={partner} products={products} hasActiveFree={hasActiveFree} onReload={load} />}
        {abaAtiva === "timeline" && <TimelinePanel partner={partner} posts={posts} onReload={load} />}
        {abaAtiva === "qrcode" && <QrCodePanel partner={partner} />}
        {abaAtiva === "freebies" && hasActiveFree && <CoachBenefitsTab forceActive />}
        {abaAtiva === "store" && hasActiveFree && <StorePage coachMode audience="partner" />}
        {abaAtiva === "profile" && <ProfilePanel partner={partner} onReload={load} />}
        {abaAtiva === "fitmind_calendar" && <FitmindCalendar />}
        {abaAtiva === "collaborators" && <CollaboratorsPanel partner={partner} coachReferralCode={coachCtx?.referralCode ?? null} />}
        {abaAtiva === "network" && (coachCtx ? <NetworkTreeTab coach={coachCtx} /> : <MyNetworkPanel />)}
        {abaAtiva === "wallet" && <PartnerWalletTab />}
        {abaAtiva === "subscription" && <SubscriptionInvoicesTab walletSource="partner" />}
        {abaAtiva === "annual" && <AnnualActivationCard />}
        {abaAtiva === "reports" && <PartnerReports />}
        {abaAtiva === "scanner" && <PartnerFreebieScanner partnerId={partner.id} />}
        {abaAtiva === "collab" && <CollabWorkspace ownerType="partner" ownerId={partner.id} />}
        {abaAtiva === "members" && unidadeAtiva && <PartnerMembersPanel unidade={unidadeAtiva} />}


      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 flex overflow-x-auto" style={{ backgroundColor: "#111" }}>
        {tabs.map(t => {
          const badge = t.key === "collab" ? collabPending : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex-1 min-w-[64px] py-2.5 flex flex-col items-center gap-0.5 text-[10px] ${abaAtiva === t.key ? "text-primary" : "text-white/50"}`}>
              <t.icon className="h-5 w-5" />
              {t.label}
              {badge > 0 && (
                <span className="absolute top-1 right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

    </div>
    </SubscriptionGuard>
    </PartnerOnboardingGate>
  );
}

function Overview({ partner, products, visits, hasActiveFree, pendingCount, coachReferralCode }: { partner: Partner; products: Product[]; visits: number; hasActiveFree: boolean; pendingCount: number; coachReferralCode?: string | null }) {
  const approved = products.filter(p => p.status === "approved" && p.is_active_by_partner).length;
  const [showVisits, setShowVisits] = useState(false);
  const [uplineCoach, setUplineCoach] = useState<{ name: string; phone: string | null } | null>(null);
  const effectiveReferralCode = coachReferralCode || partner.referral_code;
  const referralLink = effectiveReferralCode ? `${window.location.origin}/r/${effectiveReferralCode}` : "";

  useEffect(() => {
    (async () => {
      // Procura o coach que indicou esta empresa (via upline_coach_id em partners)
      const { data: pr } = await supabase
        .from("partners" as never)
        .select("upline_coach_id" as never)
        .eq("id" as never, partner.id as never)
        .maybeSingle();
      const uplineId = (pr as unknown as { upline_coach_id: string | null } | null)?.upline_coach_id;
      if (!uplineId) return;
      const { data: c } = await supabase
        .from("coaches")
        .select("profiles!coaches_profile_id_fkey(name, phone)")
        .eq("id", uplineId)
        .maybeSingle();
      const prof = (c as unknown as { profiles: { name: string; phone: string | null } | null } | null)?.profiles;
      if (prof) setUplineCoach({ name: prof.name, phone: prof.phone });
    })();
  }, [partner.id]);

  const copyReferral = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };
  const shareReferral = async () => {
    if (!referralLink) return;
    const text = `Conheça o FitMind Club — cadastre-se pelo meu link:`;
    if (navigator.share) {
      try { await navigator.share({ title: "FitMind Club", text, url: referralLink }); } catch { /* ignore */ }
    } else { copyReferral(); }
  };

  const storeLink = referralLink ? `${referralLink}?to=loja` : "";
  const copyStore = () => {
    if (!storeLink) return;
    navigator.clipboard.writeText(storeLink);
    toast.success("Link da loja copiado!");
  };
  const shareStore = async () => {
    if (!storeLink) return;
    const text = `Conheça a loja do FitMind Club:`;
    if (navigator.share) {
      try { await navigator.share({ title: "FitMind Club", text, url: storeLink }); } catch { /* ignore */ }
    } else { copyStore(); }
  };

  const coachWhatsMsg = uplineCoach ? `Oi ${uplineCoach.name.split(" ")[0]}, eu quero além de parceiro ser coach FitMind e vender mais!` : "";

  return (
    <div className="space-y-3">
      <WhatsAppGroupCard />
      <a
        href="/partner/orders-in-progress"
        className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-bold text-white">Compras em andamento</p>
            <p className="text-[11px] text-white/60">Pedidos físicos, endereço e prazo de entrega</p>
          </div>
        </div>
        <span className="text-xs text-primary font-medium">Abrir →</span>
      </a>
      <a
        href="/partner/herbalife-boletos"
        className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/15 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-bold text-white">Boletos Herbalife</p>
            <p className="text-[11px] text-white/60">Anexe o boleto de cada venda para a Fitmind pagar</p>
          </div>
        </div>
        <span className="text-xs text-emerald-300 font-medium">Abrir →</span>
      </a>
      {!hasActiveFree && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200">
          <AlertTriangle className="inline h-4 w-4 mr-1" /> Você precisa de pelo menos <b>1 produto gratuito aprovado e ativo</b> para publicar produtos pagos. Os pagos ficam pausados enquanto isso.
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setShowVisits(true)} className="text-left">
          <Stat label="Visitas (clique p/ ver)" value={visits} />
        </button>
        <Stat label="Produtos ativos" value={approved} />
        <Stat label="Pendentes" value={pendingCount} />
      </div>

      {referralLink && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-white">Seu link de indicação</h3>
          </div>
          <p className="text-[11px] text-white/50 mb-2">Compartilhe este link para indicar novos usuários ao FitMind Club. Ele leva para a página de cadastro, onde a pessoa escolhe o tipo de conta (aluno, coach, parceiro).</p>
          <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 break-all">{referralLink}</div>
          <div className="mt-2 flex gap-2">
            <button onClick={copyReferral} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20"><Copy className="h-3.5 w-3.5" /> Copiar</button>
            <button onClick={shareReferral} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Share2 className="h-3.5 w-3.5" /> Compartilhar</button>
          </div>

          <h3 className="mt-4 text-sm font-bold text-white">Link da loja</h3>
          <p className="text-[11px] text-white/50 mb-2">Leva direto para a loja pública, mantendo a indicação vinculada a você.</p>
          <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 break-all">{`${referralLink}?to=loja`}</div>
          <div className="mt-2 flex gap-2">
            <button onClick={copyStore} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20"><Copy className="h-3.5 w-3.5" /> Copiar</button>
            <button onClick={shareStore} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Share2 className="h-3.5 w-3.5" /> Compartilhar</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4 border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-white">Venha fazer parte da nossa equipe de coachs!</h3>
        </div>
        <p className="text-xs text-white/70 leading-relaxed">
          Você já tem acesso <b>gratuito</b> ao curso de coach. Converse com seu coach e venha fazer parte da nossa equipe — aumente seus resultados vendendo também planos e produtos FitMind!
        </p>
        {uplineCoach?.phone ? (
          <div className="mt-3">
            <WhatsAppButton phone={uplineCoach.phone} message={coachWhatsMsg} label={`Falar com ${uplineCoach.name.split(" ")[0]}`} size="md" />
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-white/40">Seu coach indicador ainda não tem WhatsApp cadastrado.</p>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/40 mb-2">Bem-vindo(a), {partner.fantasy_name}</p>
        <p className="text-sm text-white/70">Use as abas para gerenciar produtos, timeline, QR code de presença e seu perfil público.</p>
      </div>
      {showVisits && <PartnerVisitsModal onClose={() => setShowVisits(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/40">{label}</p>
    </div>
  );
}




function ProductsPanel({ partner, products, hasActiveFree, onReload }: { partner: Partner; products: Product[]; hasActiveFree: boolean; onReload: () => void }) {
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyCreator, setReadOnlyCreator] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [policy, setPolicy] = useState<"all" | "one_per_month">((partner.free_redeem_policy as "all" | "one_per_month") || "all");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyDismissed, setPolicyDismissed] = useState(false);
  const { cropToBlob } = useImageCrop();
  const [coproduced, setCoproduced] = useState<Array<{ coproductionId: string; creatorName: string; splitKind: string; percentOfNet: number | null; fixedAmountBrl: number | null; product: Product }>>([]);
  const loadCoproducedFn = useServerFn(listCoproducedProducts);

  useEffect(() => {
    let alive = true;
    loadCoproducedFn({ data: { entityType: "partner", entityId: partner.id } })
      .then((r) => { if (alive) setCoproduced(r.items as any); })
      .catch(() => {});
    return () => { alive = false; };
  }, [partner.id]);



  const activeFreeCount = products.filter(p => p.kind === "free" && p.status === "approved" && p.is_active_by_partner).length;
  const showPolicyBanner = activeFreeCount >= 2;

  const savePolicy = async (next: "all" | "one_per_month") => {
    setSavingPolicy(true);
    const { error } = await supabase.from("partners" as never).update({ free_redeem_policy: next } as never).eq("id" as never, partner.id);
    setSavingPolicy(false);
    if (error) return toast.error(error.message);
    setPolicy(next);
    toast.success(next === "one_per_month" ? "Regra salva: 1 benefício gratuito por mês por aluno." : "Regra salva: aluno pode resgatar todos os benefícios.");
    onReload();
  };


  const blank = (): Partial<Product> => ({
    partner_id: partner.id,
    kind: "free",
    redemption_mode: "free",
    name: "", description: "", image_url: "", image_urls: [], price: 0, stock: null,
    original_price: null,
    redemption_instructions: "", is_active_by_partner: true,
    benefit_start_time: null,
    benefit_end_time: null,
    monthly_redeem_limit: null,
    estimated_value: null,
    price_input_mode: "charge",
    coach_commission_percentage: 10,
    partner_net_amount: 0,
    section_id: null,
    category_id: null,
  });




  const upload = async (file: File) => {
    const cropped = await cropToBlob(file, { title: "Ajustar imagem do produto" });
    if (!cropped) return;
    setUploading(true);
    const ext = cropped.type === "image/png" ? "png" : "jpg";
    const path = `partners/${partner.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, cropped, { upsert: true, contentType: cropped.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setEditing(e => e ? { ...e, image_url: data.publicUrl } : e);
    setUploading(false);
  };


  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Informe o nome do produto.");

    // Valor estimado obrigatório para gratuitos/descontos
    if (editing.kind === "free") {
      const ev = Number(editing.estimated_value || 0);
      if (!ev || ev <= 0) {
        return toast.error("Informe o valor estimado deste benefício (quanto custaria fora do clube).");
      }
    }

    // Para produtos pagos, recalcula breakdown antes de salvar
    let extra: Partial<Product> = {};
    if (editing.kind === "paid") {
      const pct = (editing.coach_commission_percentage || 10) as CoachCommissionPct;
      const mode = (editing.price_input_mode || "charge") as PartnerPriceMode;
      const b = mode === "receive"
        ? computeFromReceive(editing.partner_net_amount || 0, pct)
        : computeFromCharge(editing.price || 0, pct);
      if (b.gross <= 0) return toast.error("Informe um valor maior que zero.");
      if (b.partnerNet < 0) return toast.error("Valor insuficiente para cobrir as taxas. Aumente o preço.");
      extra = {
        price: b.gross,
        original_price: editing.original_price && editing.original_price > b.gross ? Number(editing.original_price) : null,
        partner_net_amount: b.partnerNet,
        coach_commission_amount: b.coachCommission,
        network_l1_amount: b.networkL1,
        network_l2_amount: b.networkL2,
        network_l3_amount: b.networkL3,
      };
    }

    const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
    // uses_scheduling é derivado da agenda (dias/horários) no banco — nunca enviar do cliente
    const { uses_scheduling: _ignoredUsesScheduling, ...editingWithoutSchedulingFlag } = editing;
    const payload = {
      ...editingWithoutSchedulingFlag,
      ...extra,
      partner_id: partner.id,
      status: (editing.status as string | undefined) || "pending",
      admin_notes: editing.admin_notes ?? null,
      image_url: (editing.image_urls?.[0] ?? (emptyToNull(editing.image_url) as string | null)) || null,
      image_urls: editing.image_urls?.length ? editing.image_urls : (editing.image_url ? [editing.image_url] : []),
      description: emptyToNull(editing.description) as string | null,
      redemption_instructions: emptyToNull(editing.redemption_instructions) as string | null,
      section_id: emptyToNull(editing.section_id) as string | null,
      category_id: emptyToNull(editing.category_id) as string | null,
      estimated_value: editing.kind === "free" ? Number(editing.estimated_value || 0) : null,
      original_price: editing.kind === "paid" ? (editing.original_price && Number(editing.original_price) > 0 ? Number(editing.original_price) : null) : null,
      benefit_start_time: editing.kind === "free" ? editing.benefit_start_time || null : null,
      benefit_end_time: editing.kind === "free" ? editing.benefit_end_time || null : null,
      monthly_redeem_limit: editing.kind === "free"
        ? (editing.monthly_redeem_limit && editing.monthly_redeem_limit > 0 ? editing.monthly_redeem_limit : null)
        : null,
      weekly_limit_per_student: editing.kind === "free" ? Math.max(1, Number(editing.weekly_limit_per_student || 1)) : 1,
      redemption_location_name: editing.kind === "free" ? (emptyToNull(editing.redemption_location_name) as string | null) : null,
      redemption_location_url: editing.kind === "free" ? (emptyToNull(editing.redemption_location_url) as string | null) : null,
    };
    try {
      const finalPaidPrice = Number((extra.price ?? editing.price) || 0);
      if (editing.id) {
        const { id, ...up } = {
          ...payload,
          original_price: editing.kind === "paid" && editing.original_price && Number(editing.original_price) > finalPaidPrice ? Number(editing.original_price) : null,
        };
        const { error } = await supabase.from("partner_products" as never).update(up as never).eq("id" as never, id!);
        if (error) return toast.error(error.message);
      } else {
        const { error } = await supabase.from("partner_products" as never).insert({
          ...payload,
          original_price: editing.kind === "paid" && editing.original_price && Number(editing.original_price) > finalPaidPrice ? Number(editing.original_price) : null,
        } as never);
        if (error) return toast.error(error.message);
      }
    } catch (e: any) {
      return toast.error(`Falha de rede ao salvar: ${e?.message || e}. Verifique sua conexão e tente novamente.`);
    }

    toast.success("Salvo. Aguardando aprovação do admin.");
    setEditing(null); onReload();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    // Try hard delete first; if there are linked orders, fall back to soft delete
    const { error } = await supabase.from("partner_products" as never).delete().eq("id" as never, id);
    if (error) {
      if (error.code === "23503" || /foreign key/i.test(error.message)) {
        const { error: e2 } = await supabase
          .from("partner_products" as never)
          .update({ deleted_at: new Date().toISOString(), is_active_by_partner: false } as never)
          .eq("id" as never, id);
        if (e2) return toast.error(e2.message);
        toast.success("Produto arquivado (havia pedidos vinculados)"); onReload();
        return;
      }
      return toast.error(error.message);
    }
    toast.success("Removido"); onReload();
  };

  const toggleActive = async (p: Product) => {
    const { error } = await supabase.from("partner_products" as never).update({ is_active_by_partner: !p.is_active_by_partner } as never).eq("id" as never, p.id);
    if (error) return toast.error(error.message);
    onReload();
  };

  const moveProduct = async (p: Product, dir: -1 | 1) => {
    const sorted = [...products].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex((x) => x.id === p.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    const myOrder = p.sort_order ?? idx;
    const otherOrder = other.sort_order ?? j;
    const { error: e1 } = await supabase.from("partner_products" as never).update({ sort_order: otherOrder } as never).eq("id" as never, p.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("partner_products" as never).update({ sort_order: myOrder } as never).eq("id" as never, other.id);
    if (e2) return toast.error(e2.message);
    onReload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Meus produtos</h2>
        <button onClick={() => setEditing(blank())} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Novo</button>
      </div>

      {showPolicyBanner && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
          <p className="text-xs font-bold text-white mb-1">⚠️ Regra de resgate dos benefícios gratuitos</p>
          <p className="text-[11px] text-white/60 mb-2">
            Você tem <b className="text-white">{activeFreeCount} benefícios gratuitos ativos</b>. Escolha se o aluno pode resgatar todos os cupons no mês ou apenas 1 por mês desta empresa.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={savingPolicy}
              onClick={() => savePolicy("all")}
              className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition ${policy === "all" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >
              Liberar todos os cupons
              <span className="block text-[9px] font-normal opacity-80 mt-0.5">Aluno pode resgatar todos os benefícios gratuitos (respeitando horários e limite por produto).</span>
            </button>
            <button
              type="button"
              disabled={savingPolicy}
              onClick={() => savePolicy("one_per_month")}
              className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition ${policy === "one_per_month" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >
              Apenas 1 por mês
              <span className="block text-[9px] font-normal opacity-80 mt-0.5">Ao usar um cupom, os demais ficam bloqueados até o próximo mês.</span>
            </button>
          </div>
          {!policyDismissed && (
            <button onClick={() => setPolicyDismissed(true)} className="mt-2 text-[10px] text-white/40 hover:text-white/70">Ocultar aviso</button>
          )}
        </div>
      )}

      {products.length === 0 && <p className="text-sm text-white/40 text-center py-8">Nenhum produto cadastrado ainda.</p>}

      <div className="space-y-2">
        {[...products].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((p, idx, arr) => (
          <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
            {p.image_url ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} /> : <div className="h-16 w-16 rounded bg-white/5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                {p.kind === "free" ? (
                  <>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.redemption_mode === "discount" ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400"}`}>
                      {p.redemption_mode === "discount" ? "Desconto" : "Gratuito"}
                    </span>
                    {p.redemption_mode === "discount" && p.discount_percent ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">{p.discount_percent}% OFF</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Pago</span>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(p.status)}`}>{p.status}</span>
              </div>

              {p.kind === "paid" && (
                <div className="mt-0.5 text-[11px] text-white/60">
                  {p.original_price && p.original_price > p.price && (
                    <span className="mr-2 text-white/40 line-through">R$ {Number(p.original_price).toFixed(2)}</span>
                  )}
                  <span className="text-primary font-semibold">R$ {Number(p.price).toFixed(2)}</span>
                  {typeof p.partner_net_amount === "number" && p.partner_net_amount > 0 && (
                    <span className="ml-2">• Líquido: <span className="text-green-400">R$ {p.partner_net_amount.toFixed(2)}</span></span>
                  )}
                  {typeof p.coach_commission_percentage === "number" && (
                    <span className="ml-2">• Coach: {p.coach_commission_percentage}%</span>
                  )}
                </div>
              )}
              {p.kind === "free" && typeof p.estimated_value === "number" && p.estimated_value > 0 && (
                <p className="mt-0.5 text-[11px] text-white/60">
                  Valor estimado: <span className="text-green-400 font-semibold">R$ {Number(p.estimated_value).toFixed(2)}</span>
                </p>
              )}
              {p.status === "rejected" && p.admin_notes && <p className="text-[10px] text-red-300 mt-1">Obs.: {p.admin_notes}</p>}
              {p.kind === "free" && formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                  <Clock className="h-3 w-3" /> {formatBenefitWindow(p.benefit_start_time, p.benefit_end_time)}
                </p>
              )}
              {p.kind === "free" && p.monthly_redeem_limit ? (
                <p className="mt-1 ml-1 inline-block rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-400">
                  Limite: {p.monthly_redeem_limit}x/mês por aluno
                </p>
              ) : null}
              <div className="mt-1.5 flex gap-2 items-center flex-wrap">
                {p.is_mirrored && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">Herbalife (espelho)</span>
                )}
                {!p.is_mirrored && (
                  <>
                    <button onClick={() => setEditing(p)} className="text-[11px] text-white/60 hover:text-white">Editar</button>
                    <button
                      onClick={() => {
                        const { id: _id, ...rest } = p;
                        void _id;
                        setEditing({ ...rest, name: `${p.name} (cópia)`, status: p.status, admin_notes: p.admin_notes, is_active_by_partner: true, is_mirrored: false, mirror_source_product_id: null });
                      }}
                      className="text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> Duplicar
                    </button>
                    <button onClick={() => moveProduct(p, -1)} disabled={idx === 0} className="text-[11px] text-white/60 hover:text-white disabled:opacity-30" title="Mover para cima">↑</button>
                    <button onClick={() => moveProduct(p, 1)} disabled={idx === arr.length - 1} className="text-[11px] text-white/60 hover:text-white disabled:opacity-30" title="Mover para baixo">↓</button>
                  </>
                )}
                <button onClick={() => toggleActive(p)} className="text-[11px] text-white/60 hover:text-white" title={p.is_active_by_partner ? "Ocultar do aluno" : "Mostrar para o aluno"}>{p.is_active_by_partner ? "Ocultar" : "Mostrar"}</button>
                {!p.is_mirrored && (
                  <button onClick={() => remove(p.id)} className="text-[11px] text-red-400"><Trash2 className="inline h-3 w-3" /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {coproduced.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-white">Co-produções (somente visualização)</h3>
          </div>
          <p className="text-[11px] text-white/40">
            Você é coprodutor destes produtos. Pode visualizar todas as configurações, mas apenas o criador pode editá-las.
          </p>
          {coproduced.map((c) => {
            const p = c.product as any;
            const shareLabel = c.splitKind === "percent"
              ? `${Number(c.percentOfNet || 0).toFixed(2)}% do líquido`
              : `R$ ${Number(c.fixedAmountBrl || 0).toFixed(2)} por venda`;
            return (
              <div key={c.coproductionId} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
                {p.image_url
                  ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} />
                  : <div className="h-16 w-16 rounded bg-white/5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{p.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">Co-produção</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/60">
                    Criador: <span className="text-white">{c.creatorName}</span> · Sua parte: <span className="text-primary">{shareLabel}</span>
                  </p>
                  <button
                    onClick={() => { setReadOnly(true); setReadOnlyCreator(c.creatorName); setEditing(p); }}
                    className="mt-1.5 text-[11px] text-primary hover:text-primary/80 inline-flex items-center gap-1"
                  >
                    <Eye className="h-3 w-3" /> Visualizar painel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2">
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-white">{readOnly ? "Visualizar" : (editing.id ? "Editar" : "Novo")} produto</h3>
              <button onClick={() => { setEditing(null); setReadOnly(false); setReadOnlyCreator(null); }}><X className="h-5 w-5 text-white/60" /></button>
            </div>
            {readOnly && (
              <div className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
                Visualização somente-leitura. Apenas <strong>{readOnlyCreator || "o criador"}</strong> pode editar este produto.
              </div>
            )}
            <fieldset disabled={readOnly} className="space-y-3 text-sm border-0 p-0 m-0 disabled:opacity-90">

              <div>
                <label className="text-xs text-white/60">Tipo</label>
                <select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as "free" | "paid" })} disabled={editing.kind === "paid" && !hasActiveFree && !editing.id} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-white">
                  <option value="free">Benefício para o aluno (obrigatório ter ao menos 1)</option>
                  <option value="paid" disabled={!hasActiveFree && !editing.id}>Pago / Patrocinado {!hasActiveFree && !editing.id ? "(crie 1 benefício antes)" : ""}</option>
                </select>
              </div>
              {editing.kind === "free" && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <label className="text-xs font-bold text-primary">Modalidade do benefício</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, redemption_mode: "free" })}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${(editing.redemption_mode || "free") === "free" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                    >
                      Gratuito
                      <span className="block text-[9px] font-normal opacity-80 mt-0.5">Produto/serviço sem custo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, redemption_mode: "discount" })}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${editing.redemption_mode === "discount" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                    >
                      Cupom de desconto
                      <span className="block text-[9px] font-normal opacity-80 mt-0.5">% OFF sobre o preço normal</span>
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-white/50">
                    {editing.redemption_mode === "discount"
                      ? "O aluno gera um cupom para apresentar e receber desconto no estabelecimento."
                      : "O aluno gera um cupom para resgatar o item/serviço gratuitamente."}
                  </p>
                </div>
              )}
              {editing.kind === "free" && editing.redemption_mode === "discount" && (
                <Field label="Porcentagem do desconto (%)">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editing.discount_percent ?? ""}
                    onChange={e => setEditing({ ...editing, discount_percent: e.target.value === "" ? null : Math.min(100, Math.max(1, Number(e.target.value))) })}
                    placeholder="Ex.: 20"
                    className="field-input"
                  />
                  <p className="mt-1 text-[10px] text-white/40">
                    Aparece em destaque para o aluno como "X% OFF".
                  </p>
                </Field>
              )}

              {editing.kind === "free" && (
                <Field label="Valor estimado deste benefício (R$) *">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.estimated_value ?? ""}
                    onChange={e => setEditing({ ...editing, estimated_value: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                    placeholder="Ex.: 80.00"
                    className="field-input"
                    required
                  />
                  <p className="mt-1 text-[10px] text-white/45">
                    {editing.redemption_mode === "discount"
                      ? "Preço cheio do produto/serviço (sem o desconto). Usado para mostrar ao aluno quanto ele economiza."
                      : "Quanto este benefício custaria fora do clube. Usado para mostrar ao aluno quanto ele economiza."}
                  </p>
                </Field>
              )}


              {editing.kind === "free" && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <Clock className="h-3.5 w-3.5" /> Horário permitido de uso
                  </div>
                  <p className="mt-1 text-[10px] text-white/45">Opcional. Deixe em branco para permitir resgate em qualquer horário.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="Início">
                      <input
                        type="time"
                        value={editing.benefit_start_time?.slice(0, 5) || ""}
                        onChange={e => setEditing({ ...editing, benefit_start_time: e.target.value || null })}
                        className="field-input"
                      />
                    </Field>
                    <Field label="Fim">
                      <input
                        type="time"
                        value={editing.benefit_end_time?.slice(0, 5) || ""}
                        onChange={e => setEditing({ ...editing, benefit_end_time: e.target.value || null })}
                        className="field-input"
                      />
                    </Field>
                  </div>
                  {formatBenefitWindow(editing.benefit_start_time, editing.benefit_end_time) && (
                    <p className="mt-2 rounded-lg bg-black/30 px-3 py-2 text-[11px] font-bold text-primary">
                      {formatBenefitWindow(editing.benefit_start_time, editing.benefit_end_time)}
                    </p>
                  )}
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-xs font-bold text-primary">Limite mensal por aluno</div>
                    <p className="mt-1 text-[10px] text-white/45">Opcional. Quantas vezes cada aluno pode resgatar este cupom no mês. Deixe em branco para ilimitado.</p>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Ilimitado"
                      value={editing.monthly_redeem_limit ?? ""}
                      onChange={e => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Math.max(1, Math.floor(Number(v)));
                        setEditing({ ...editing, monthly_redeem_limit: n });
                      }}
                      className="field-input mt-2 w-32"
                    />
                  </div>
                </div>
              )}

              {editing.kind === "free" && editing.redemption_mode === "free" && editing.id && (
                <PartnerFreebieScheduleEditor
                  productId={editing.id}
                  weeklyLimit={editing.weekly_limit_per_student ?? 1}
                  onChangeWeeklyLimit={(n) => setEditing({ ...editing, weekly_limit_per_student: n })}
                  onSaved={(hasSchedules) => setEditing((prev) => (prev ? { ...prev, uses_scheduling: hasSchedules } : prev))}
                />
              )}
              {editing.kind === "free" && editing.redemption_mode === "free" && !editing.id && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                  Salve o produto primeiro para configurar dias e horários disponíveis (agenda com vagas e reserva).
                </p>
              )}

              {editing.kind === "free" && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-bold text-white">Local de resgate (opcional)</div>
                  <p className="mt-1 text-[10px] text-white/45">
                    Preencha apenas se o resgate acontece em um endereço diferente do cadastro da sua empresa. O aluno verá o nome e um link para abrir no mapa junto do QR code.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <Field label="Nome do local">
                      <input
                        value={editing.redemption_location_name || ""}
                        onChange={e => setEditing({ ...editing, redemption_location_name: e.target.value })}
                        placeholder="Ex.: Academia Move — Cuiabá/MT"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Link do mapa (Google Maps, Waze, etc.)">
                      <input
                        value={editing.redemption_location_url || ""}
                        onChange={e => setEditing({ ...editing, redemption_location_url: e.target.value })}
                        placeholder="https://maps.google.com/?q=..."
                        className="field-input"
                      />
                    </Field>
                  </div>
                </div>
              )}



              <Field label="Nome"><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} className="field-input" /></Field>
              <Field label="Descrição"><textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="field-input" /></Field>
              <Field label="Imagens">
                <ProductImageGallery
                  folder={`partners/${partner.id}`}
                  images={editing.image_urls?.length ? editing.image_urls : (editing.image_url ? [editing.image_url] : [])}
                  onChange={(next: string[]) => setEditing({ ...editing, image_urls: next, image_url: next[0] || null })}
                />
              </Field>

              {editing.kind === "paid" && (
                <PaidPricingEditor
                  product={editing}
                  onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
                />
              )}

              {editing.kind === "paid" && (
                <Field label="Estoque (opcional)"><input type="number" value={editing.stock ?? ""} onChange={e => setEditing({ ...editing, stock: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" /></Field>
              )}

              {editing.kind === "paid" && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-primary">
                    <input
                      type="checkbox"
                      checked={!!(editing as any).is_physical}
                      onChange={e => setEditing({ ...editing, is_physical: e.target.checked } as any)}
                    />
                    Produto físico (requer entrega)
                  </label>
                  {(editing as any).is_physical && (
                    <Field label="Prazo médio de entrega (dias) *">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={(editing as any).delivery_days ?? ""}
                        onChange={e => setEditing({ ...editing, delivery_days: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) } as any)}
                        placeholder="Ex.: 7"
                        className="field-input"
                      />
                    </Field>
                  )}
                </div>
              )}

              <CategoryPicker
                targetAudience="partner"
                sectionId={editing.section_id}
                categoryId={editing.category_id}
                onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
              />

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-bold text-primary">Evento com data específica (opcional)</div>
                <p className="text-[10px] text-white/60">Para workshops ou eventos de uso único: defina a data, os horários e o número máximo de vagas. Deixe em branco se o produto for de uso contínuo.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Data do evento">
                    <input type="date" value={editing.event_date ?? ""} onChange={e => setEditing({ ...editing, event_date: e.target.value || null })} className="field-input" />
                  </Field>
                  <Field label="Vagas disponíveis">
                    <input type="number" min={1} value={editing.event_capacity ?? ""} onChange={e => setEditing({ ...editing, event_capacity: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" placeholder="Ex: 20" />
                  </Field>
                  <Field label="Horário de abertura">
                    <input type="time" value={editing.event_start_time ?? ""} onChange={e => setEditing({ ...editing, event_start_time: e.target.value || null })} className="field-input" />
                  </Field>
                  <Field label="Horário de encerramento">
                    <input type="time" value={editing.event_end_time ?? ""} onChange={e => setEditing({ ...editing, event_end_time: e.target.value || null })} className="field-input" />
                  </Field>
                </div>
              </div>


              
            </fieldset>
            {editing.id && editing.kind === "paid" && !readOnly && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <CoproductionEditor
                  productType="partner"
                  productId={editing.id}
                  creatorType="partner"
                  creatorId={partner.id}
                  productNetValueBrl={Number(editing.partner_net_amount || editing.price || 0)}
                />
              </div>
            )}
            {editing.kind === "paid" && !readOnly && (
              <div className="mt-4 border-t border-white/10 pt-4">
                {editing.id ? (
                  <ProductDownloadsManager partnerProductId={editing.id} />
                ) : (
                  <div className="rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-xs text-white/60">
                    <p className="font-semibold text-white/80 mb-1">Arquivos para download após compra</p>
                    <p>Salve o produto primeiro para poder anexar ebooks/PDFs. Depois, edite este produto novamente para enviar os arquivos.</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={() => { setEditing(null); setReadOnly(false); setReadOnlyCreator(null); }} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-white">
                {readOnly ? "Fechar" : "Cancelar"}
              </button>
              {!readOnly && (
                <button onClick={save} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Save className="inline h-4 w-4 mr-1" /> Salvar</button>
              )}
            </div>

          </div>
        </div>
      )}

      <style>{`.field-input { width:100%; border-radius:.375rem; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.1); padding:.5rem .75rem; color:white; font-size:.875rem; }`}</style>
    </div>
  );
}

function PaidPricingEditor({ product, onChange }: { product: Partial<Product>; onChange: (patch: Partial<Product>) => void }) {
  const mode = (product.price_input_mode || "charge") as PartnerPriceMode;
  const pct = (product.coach_commission_percentage || 10) as CoachCommissionPct;
  const [method, setMethod] = useState<"pix" | "card">("card");

  const charge = Number(product.price) || 0;
  const receive = Number(product.partner_net_amount) || 0;

  const breakdown = mode === "receive"
    ? computeFromReceive(receive, pct, method)
    : computeFromCharge(charge, pct, method);

  const updateCharge = (n: number) => onChange({ price: n });
  const updateReceive = (n: number) => {
    const inv = computeFromReceive(n, pct, method);
    onChange({ partner_net_amount: n, price: inv.gross });
  };

  const switchMode = (next: PartnerPriceMode) => {
    if (next === "receive") {
      const b = computeFromCharge(charge, pct, method);
      onChange({ price_input_mode: next, partner_net_amount: Math.max(0, b.partnerNet) });
    } else {
      onChange({ price_input_mode: next, price: breakdown.gross });
    }
  };

  const changePct = (next: CoachCommissionPct) => {
    if (mode === "receive") {
      const inv = computeFromReceive(receive, next, method);
      onChange({ coach_commission_percentage: next, price: inv.gross });
    } else {
      onChange({ coach_commission_percentage: next });
    }
  };

  const changeMethod = (m: "pix" | "card") => {
    setMethod(m);
    if (mode === "receive") {
      const inv = computeFromReceive(receive, pct, m);
      onChange({ price: inv.gross });
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-primary">
        <DollarSign className="h-3.5 w-3.5" /> Financeiro do produto
      </div>

      <div className="flex rounded-lg bg-black/40 p-0.5">
        <button type="button" onClick={() => switchMode("charge")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${mode === "charge" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Quanto cobrar
        </button>
        <button type="button" onClick={() => switchMode("receive")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${mode === "receive" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Quanto receber
        </button>
      </div>

      {mode === "charge" ? (
        <Field label="Valor de venda cobrado do cliente">
          <CurrencyInputBRL value={charge} onChange={updateCharge} />
        </Field>
      ) : (
        <Field label="Quanto você quer receber líquido">
          <CurrencyInputBRL value={receive} onChange={updateReceive} />
          <p className="mt-1 text-[10px] text-white/40">O preço cobrado é aumentado automaticamente para cobrir as taxas (igual simulação de cartão em apps bancários).</p>
        </Field>
      )}

      <Field label="Valor original do produto (opcional)">
        <CurrencyInputBRL value={Number(product.original_price || 0)} onChange={(n) => onChange({ original_price: n > 0 ? n : null })} />
        <p className="mt-1 text-[10px] text-white/40">Use quando houver desconto. O cliente verá o valor original riscado e o valor de venda em destaque.</p>
      </Field>

      <div>
        <label className="text-xs text-white/60">Forma de pagamento simulada</label>
        <div className="mt-1 flex rounded-lg bg-black/40 p-0.5">
          <button type="button" onClick={() => changeMethod("pix")}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${method === "pix" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
            PIX 0,99%
          </button>
          <button type="button" onClick={() => changeMethod("card")}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${method === "card" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
            Cartão 4,98%
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/60">Comissão para o coach vendedor (10% a 50%)</label>
        <div className="mt-1 grid grid-cols-5 gap-1.5">
          {COACH_COMMISSION_OPTIONS.map(opt => (
            <button key={opt} type="button" onClick={() => changePct(opt)}
              className={`rounded-lg py-1.5 text-xs font-bold transition ${pct === opt ? "bg-primary text-primary-foreground" : "bg-black/40 text-white/60 hover:text-white"}`}>
              {opt}%
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-white/40">Essa % é o que vai para o coach que vender o produto. O restante (após taxas) fica com você.</p>
      </div>

      <div className="rounded-lg bg-black/40 p-2.5 text-[11px] space-y-1">
        <BreakdownLine label="Valor cobrado do cliente" value={breakdown.gross} bold />
        <BreakdownLine label={`− Taxa ${method === "pix" ? "PIX (0,99%)" : "cartão (4,98%)"}`} value={-breakdown.paymentFee} muted />
        <BreakdownLine label="− Reserva fiscal estimada (6%)" value={-breakdown.tax} muted />
        <BreakdownLine label="− Taxa do sistema (5%)" value={-breakdown.systemFee} muted />
        <BreakdownLine label={`− Comissão coach (${pct}%)`} value={-breakdown.coachCommission} muted />
        <div className="my-1 border-t border-white/10" />
        <BreakdownLine label="✓ Líquido para você" value={breakdown.partnerNet} highlight />
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          <p className="text-white/40 text-[10px] font-semibold uppercase">Distribuição da comissão do coach</p>
          <BreakdownLine label="Coach vendedor (líquido)" value={breakdown.coachNet} muted />
          <BreakdownLine label="Rede L1 (3%)" value={breakdown.networkL1} muted />
          <BreakdownLine label="Rede L2 (2%)" value={breakdown.networkL2} muted />
          <BreakdownLine label="Rede L3 (1%)" value={breakdown.networkL3} muted />
        </div>
      </div>
    </div>
  );
}

function BreakdownLine({ label, value, bold, muted, highlight }: { label: string; value: number; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-white" : muted ? "text-white/60" : ""} ${highlight ? "text-green-400 font-bold" : ""}`}>
      <span>{label}</span>
      <span>R$ {value.toFixed(2)}</span>
    </div>
  );
}



function statusColor(s: string) {
  return s === "approved" ? "bg-green-500/15 text-green-400" : s === "rejected" ? "bg-red-500/15 text-red-400" : s === "inactive" ? "bg-white/10 text-white/50" : "bg-yellow-500/15 text-yellow-400";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-white/60">{label}</label><div className="mt-1">{children}</div></div>;
}

function TimelinePanel({ partner, posts, onReload }: { partner: Partner; posts: Post[]; onReload: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const { cropToBlob } = useImageCrop();

  const upload = async (file: File) => {
    const cropped = await cropToBlob(file, { title: "Ajustar imagem do post" });
    if (!cropped) return;
    setUploading(true);
    const ext = cropped.type === "image/png" ? "png" : "jpg";
    const path = `partners/${partner.id}/posts/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, cropped, { contentType: cropped.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setPending(data.publicUrl);
    setUploading(false);
  };


  const publish = async () => {
    if (!pending) return;
    const { error } = await supabase.from("partner_posts" as never).insert({ partner_id: partner.id, image_url: pending, caption } as never);
    if (error) return toast.error(error.message);
    toast.success("Publicado"); setPending(null); setCaption(""); onReload();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir post?")) return;
    await supabase.from("partner_posts" as never).delete().eq("id" as never, id);
    onReload();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/60 mb-2">Adicionar foto à timeline (máx. 30 posts)</p>
        {pending ? (
          <div className="space-y-2">
            <img src={pending} className="w-full rounded" />
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Legenda (opcional)" className="w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
            <div className="flex gap-2">
              <button onClick={() => setPending(null)} className="flex-1 rounded bg-white/5 py-2 text-sm text-white">Cancelar</button>
              <button onClick={publish} className="flex-1 rounded bg-primary py-2 text-sm font-bold text-primary-foreground">Publicar</button>
            </div>
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-white/20">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-white/40" />}
            <span className="text-[10px] text-white/40">Recomendado: 1080×1080px (1:1)</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} disabled={posts.length >= 30} />
          </label>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {posts.map(p => (
          <div key={p.id} className="relative aspect-square group">
            <img src={p.image_url} className="h-full w-full object-cover rounded" />
            <button onClick={() => remove(p.id)} className="absolute top-1 right-1 bg-black/70 rounded p-1 opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-white" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QrCodePanel({ partner }: { partner: Partner }) {
  const url = `${window.location.origin}/partner-checkin/${partner.id}`;
  const [mode, setMode] = useState<"display" | "scan">("scan");
  return (
    <div className="space-y-3">
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        <button onClick={() => setMode("scan")} className={`flex-1 py-2 text-xs font-bold ${mode === "scan" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>Ler QR do aluno</button>
        <button onClick={() => setMode("display")} className={`flex-1 py-2 text-xs font-bold ${mode === "display" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>Meu QR fixo</button>
      </div>
      {mode === "scan" ? (
        <StudentQrScanner partner={partner} />
      ) : (
        <div className="rounded-xl p-6 text-center space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
          <h2 className="text-lg font-bold text-white">{partner.fantasy_name}</h2>
          <p className="text-xs text-white/50">QR Code fixo de check-in — imprima e deixe visível no estabelecimento. Alunos podem escanear para registrar a visita.</p>
          <div className="inline-block bg-white p-4 rounded-xl">
            <QRCodeSVG value={url} size={220} />
          </div>
          <p className="text-[10px] text-white/40 break-all">{url}</p>
          <button onClick={() => window.print()} className="rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Imprimir</button>
        </div>
      )}
    </div>
  );
}

interface ScanPreview { student_id: string; student_name: string; student_avatar: string | null; student_email: string | null; student_phone: string | null; student_city: string | null; student_state: string | null; }
interface ScanResult { ok: boolean; student_name?: string; student_avatar?: string | null; partner_name?: string; visited_at?: string; error?: string; }
interface CouponPreview { coupon_id: string; status: string; student_name: string; student_photo: string | null; product_name: string; created_at: string; redeemed_at: string | null; benefit_start_time: string | null; benefit_end_time: string | null; token: string; }


function StudentQrScanner({ partner }: { partner: Partner }) {
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastValue, setLastValue] = useState<string>("");

  const extractStudentId = (raw: string): string | null => {
    const trimmed = raw.trim();
    const m = trimmed.match(/checkin\/([0-9a-f-]{36})/i);
    if (m) return m[1];
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
    return null;
  };

  const extractCouponToken = (raw: string): string | null => {
    const trimmed = raw.trim().toUpperCase();
    const m = trimmed.match(/^COUPON:([A-F0-9]{24})$/);
    return m ? m[1] : null;
  };

  const onDetected = async (value: string) => {
    if (processing || preview || couponPreview || result || value === lastValue) return;
    setLastValue(value);

    const couponToken = extractCouponToken(value);
    if (couponToken) {
      setProcessing(true);
      setScanning(false);
      const { data, error } = await supabase.rpc("partner_preview_coupon" as never, { p_token: couponToken } as never);
      setProcessing(false);
      if (error) { setResult({ ok: false, error: error.message }); return; }
      const rows = data as unknown as Omit<CouponPreview, "token">[];
      if (!rows || rows.length === 0) {
        setResult({ ok: false, error: "Cupom não encontrado ou não pertence à sua empresa." });
        return;
      }
      setCouponPreview({ ...rows[0], token: couponToken });
      return;
    }

    const studentId = extractStudentId(value);
    if (!studentId) {
      toast.error("QR inválido. Use o QR da carteirinha do aluno ou de um cupom.");
      setTimeout(() => setLastValue(""), 1500);
      return;
    }
    setProcessing(true);
    setScanning(false);
    const { data, error } = await supabase.rpc("partner_preview_student" as never, { _student_id: studentId } as never);
    setProcessing(false);
    if (error) {
      setResult({ ok: false, error: error.message });
      return;
    }
    setPreview(data as unknown as ScanPreview);
  };

  const confirmVisit = async () => {
    if (!preview) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc("partner_scan_student" as never, { _student_id: preview.student_id } as never);
    setProcessing(false);
    setPreview(null);
    if (error) { setResult({ ok: false, error: error.message }); return; }
    const r = data as unknown as ScanResult;
    setResult({ ...r, ok: true });
    toast.success(`Check-in: ${r.student_name}`);
  };

  const confirmCoupon = async () => {
    if (!couponPreview) return;
    setProcessing(true);
    const { error } = await supabase.rpc("partner_redeem_coupon" as never, { p_token: couponPreview.token } as never);
    setProcessing(false);
    const cp = couponPreview;
    setCouponPreview(null);
    if (error) { setResult({ ok: false, error: error.message }); return; }
    setResult({ ok: true, student_name: cp.student_name, student_avatar: cp.student_photo, visited_at: new Date().toISOString() });
    toast.success(`Cupom validado: ${cp.product_name}`);
  };

  const reset = () => { setResult(null); setPreview(null); setCouponPreview(null); setLastValue(""); setScanning(true); };


  if (partner.status !== "approved") {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
        <p className="text-sm text-white/70">Sua empresa precisa estar aprovada para validar QR codes de alunos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/60 text-center mb-2">Aponte a câmera para o QR da carteirinha do aluno <span className="text-primary">ou de um cupom de desconto</span></p>
        {scanning && !preview && !couponPreview && !result && <QrScannerView onDetected={onDetected} />}

        {processing && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {preview && !processing && (
          <div className="text-center py-4">
            <p className="text-[11px] uppercase tracking-wider text-primary/80 font-bold mb-2">Confirme o aluno</p>
            {preview.student_avatar ? (
              <img src={preview.student_avatar} className="mx-auto h-28 w-28 rounded-full object-cover border-4 border-primary/30" alt={preview.student_name} />
            ) : (
              <div className="mx-auto h-28 w-28 rounded-full bg-primary/15 flex items-center justify-center text-3xl font-bold text-primary">
                {preview.student_name.charAt(0)}
              </div>
            )}
            <p className="mt-3 text-xl font-bold text-white">{preview.student_name}</p>
            {preview.student_email && <p className="text-xs text-white/50">{preview.student_email}</p>}
            {(preview.student_city || preview.student_state) && (
              <p className="text-[11px] text-white/40">{[preview.student_city, preview.student_state].filter(Boolean).join(" / ")}</p>
            )}
            <p className="mt-3 text-xs text-white/60">É esta pessoa? Confirme para registrar a visita.</p>
            <div className="mt-4 flex gap-2 max-w-xs mx-auto">
              <button onClick={reset} className="flex-1 rounded bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
                <X className="inline h-4 w-4 mr-1" /> Cancelar
              </button>
              <button onClick={confirmVisit} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                <Check className="inline h-4 w-4 mr-1" /> Confirmar
              </button>
            </div>
          </div>
        )}
        {couponPreview && !processing && (
          <div className="text-center py-4">
            <p className="text-[11px] uppercase tracking-wider text-primary/80 font-bold mb-2">Cupom de desconto</p>
            {couponPreview.student_photo ? (
              <img src={couponPreview.student_photo} className="mx-auto h-24 w-24 rounded-full object-cover border-4 border-primary/30" alt={couponPreview.student_name} />
            ) : (
              <div className="mx-auto h-24 w-24 rounded-full bg-primary/15 flex items-center justify-center text-3xl font-bold text-primary">
                {couponPreview.student_name.charAt(0)}
              </div>
            )}
            <p className="mt-3 text-lg font-bold text-white">{couponPreview.student_name}</p>
            <p className="text-sm text-primary mt-1">{couponPreview.product_name}</p>
            {formatBenefitWindow(couponPreview.benefit_start_time, couponPreview.benefit_end_time) && (
              <p className="mx-auto mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                <Clock className="h-3.5 w-3.5" /> {formatBenefitWindow(couponPreview.benefit_start_time, couponPreview.benefit_end_time)}
              </p>
            )}
            <p className="text-[10px] text-white/40 mt-1">Gerado em {new Date(couponPreview.created_at).toLocaleString("pt-BR")}</p>
            {couponPreview.status !== "active" ? (
              <>
                <p className="mt-3 text-sm text-red-400 font-bold">Cupom já {couponPreview.status === "used" ? "utilizado" : "cancelado"}</p>
                {couponPreview.redeemed_at && <p className="text-[10px] text-white/40">em {new Date(couponPreview.redeemed_at).toLocaleString("pt-BR")}</p>}
                <button onClick={reset} className="mt-4 rounded bg-white/10 px-4 py-2 text-sm text-white">OK</button>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-white/60">Confirme para aplicar o desconto. O cupom será marcado como usado.</p>
                <div className="mt-4 flex gap-2 max-w-xs mx-auto">
                  <button onClick={reset} className="flex-1 rounded bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"><X className="inline h-4 w-4 mr-1" /> Cancelar</button>
                  <button onClick={confirmCoupon} className="flex-1 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"><Check className="inline h-4 w-4 mr-1" /> Validar</button>
                </div>
              </>
            )}
          </div>
        )}

        {result?.ok && (
          <div className="text-center py-6">
            {result.student_avatar ? (
              <img src={result.student_avatar} className="mx-auto h-20 w-20 rounded-full object-cover" alt={result.student_name} />
            ) : (
              <div className="mx-auto h-20 w-20 rounded-full bg-green-500/15 flex items-center justify-center">
                <Check className="h-10 w-10 text-green-400" />
              </div>
            )}
            <p className="mt-3 text-lg font-bold text-white">{result.student_name}</p>
            <p className="text-xs text-green-400 mt-1">Visita registrada com sucesso</p>
            <p className="text-[10px] text-white/40 mt-1">{result.visited_at ? new Date(result.visited_at).toLocaleString("pt-BR") : ""}</p>
            <button onClick={reset} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Ler outro QR</button>
          </div>
        )}
        {result && !result.ok && (
          <div className="text-center py-6">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-2 text-sm text-red-300">{result.error}</p>
            <button onClick={reset} className="mt-4 rounded bg-white/10 px-4 py-2 text-sm text-white">Tentar novamente</button>
          </div>
        )}
      </div>
    </div>
  );
}


function QrScannerView({ onDetected }: { onDetected: (v: string) => void }) {
  // Lazy import to avoid SSR issues
  const [Comp, setComp] = useState<React.ComponentType<{ onScan: (codes: { rawValue: string }[]) => void; onError?: (e: unknown) => void; constraints?: MediaTrackConstraints; styles?: { container?: React.CSSProperties }; components?: { finder?: boolean }; }> | null>(null);
  useEffect(() => {
    let active = true;
    import("@yudiel/react-qr-scanner").then((m) => { if (active) setComp(() => m.Scanner); });
    return () => { active = false; };
  }, []);
  if (!Comp) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return (
    <div className="overflow-hidden rounded-lg">
      <Comp
        onScan={(codes) => { if (codes[0]?.rawValue) onDetected(codes[0].rawValue); }}
        onError={(e) => console.warn("scanner", e)}
        constraints={{ facingMode: "environment" }}
        components={{ finder: true }}
      />
    </div>
  );
}

function ProfilePanel({ partner, onReload }: { partner: Partner; onReload: () => void }) {
  const [form, setForm] = useState(partner);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [pendingCover, setPendingCover] = useState<File | null>(null);

  const upload = async (blob: Blob, field: "photo_url" | "cover_url") => {
    setUploading(true);
    const path = `partners/${partner.id}/${field}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("store-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setForm((f) => ({ ...f, [field]: data.publicUrl }));
    setUploading(false);
    if (field === "photo_url") setPendingPhoto(null); else setPendingCover(null);
  };


  const save = async () => {
    setSaving(true);
    const { id, profile_id, status, ...up } = form;
    const { data: row, error } = await supabase.from("partners" as never).update(up as never).eq("id" as never, partner.id).select("id" as never).maybeSingle();
    setSaving(false);
    if (error) { console.error("partner save error", error); return toast.error(error.message); }
    if (!row) { console.error("partner save 0 rows", partner.id); return toast.error("Nada foi salvo — verifique sua sessão."); }
    toast.success("Perfil atualizado"); onReload();
  };

  return (
    <div className="space-y-3 rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <Field label="Foto / Logo">
        <div className="flex items-center gap-3">
          {form.photo_url && <img src={form.photo_url} className="h-16 w-16 rounded-full object-cover" />}
          <div>
            <label className="cursor-pointer rounded bg-white/10 px-3 py-1.5 text-xs text-white">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Trocar foto"}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPendingPhoto(f); e.target.value = ""; }} />
            </label>
            <p className="mt-1 text-[10px] text-white/40">Recomendado: 512×512px (1:1)</p>
          </div>
        </div>
      </Field>
      <Field label="Capa do perfil">
        <div className="space-y-2">
          {form.cover_url ? (
            <img src={form.cover_url} className="h-28 w-full rounded-lg object-cover" />
          ) : (
            <div className="h-28 w-full rounded-lg bg-white/5 border border-dashed border-white/15 flex items-center justify-center text-[11px] text-white/40">
              Nenhuma capa adicionada
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded bg-white/10 px-3 py-1.5 text-xs text-white">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : (form.cover_url ? "Trocar capa" : "Adicionar capa")}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPendingCover(f); e.target.value = ""; }} />
            </label>
            {form.cover_url && (
              <button type="button" onClick={() => setForm({ ...form, cover_url: null })} className="text-[11px] text-red-300 hover:underline">Remover</button>
            )}
          </div>
          <p className="text-[10px] text-white/40">Recomendado: 1200×400px (banner)</p>
        </div>
      </Field>
      <Field label="Nome fantasia"><input className="field-input" value={form.fantasy_name} onChange={e => setForm({ ...form, fantasy_name: e.target.value })} /></Field>
      <Field label="Descrição"><textarea className="field-input" rows={3} value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Área de atuação"><input className="field-input" placeholder="Ex: Alimentação saudável" value={form.business_area || ""} onChange={e => setForm({ ...form, business_area: e.target.value })} /></Field>
        <Field label="Especialidade"><input className="field-input" placeholder="Ex: Açaí e smoothies" value={form.specialty || ""} onChange={e => setForm({ ...form, specialty: e.target.value })} /></Field>
      </div>
      <Field label="WhatsApp (privado — usado internamente)"><input className="field-input" value={form.whatsapp || ""} onChange={e => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} /></Field>
      <Field label="WhatsApp empresarial público (loja)"><input className="field-input" value={form.public_whatsapp || ""} placeholder="(00) 00000-0000 — em branco usa o privado" onChange={e => setForm({ ...form, public_whatsapp: maskPhone(e.target.value) })} /></Field>
      <Field label="Instagram (@usuario ou URL)"><input className="field-input" value={form.instagram || ""} onChange={e => setForm({ ...form, instagram: e.target.value })} /></Field>
      <Field label="Facebook (URL)"><input className="field-input" value={form.facebook || ""} onChange={e => setForm({ ...form, facebook: e.target.value })} /></Field>
      <Field label="Website"><input className="field-input" value={form.website || ""} onChange={e => setForm({ ...form, website: e.target.value })} /></Field>
      <Field label="Endereço"><input className="field-input" value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2"><Field label="Cidade"><input className="field-input" value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} /></Field></div>
        <Field label="UF"><input className="field-input" value={form.state || ""} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} /></Field>
      </div>
      <button onClick={save} disabled={saving} className="w-full rounded bg-primary py-2 text-sm font-bold text-primary-foreground">{saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <><Save className="inline h-4 w-4 mr-1" /> Salvar</>}</button>
      <style>{`.field-input { width:100%; border-radius:.375rem; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.1); padding:.5rem .75rem; color:white; font-size:.875rem; }`}</style>
      <ImageCropperDialog file={pendingPhoto} aspect={1} shape="circle" title="Ajustar logo / foto" onCancel={() => setPendingPhoto(null)} onConfirm={(b) => upload(b, "photo_url")} />
      <ImageCropperDialog file={pendingCover} aspect={1200 / 400} title="Ajustar capa do perfil" outputSize={1600} onCancel={() => setPendingCover(null)} onConfirm={(b) => upload(b, "cover_url")} />
    </div>
  );
}

type Collaborator = {
  id: string;
  created_at: string;
  profiles: { name: string; email: string | null; phone: string | null; photo_url: string | null } | null;
};

function CollaboratorsPanel({ partner, coachReferralCode }: { partner: Partner; coachReferralCode?: string | null }) {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const effectiveCode = coachReferralCode || partner.referral_code;
  const link = effectiveCode ? `${window.location.origin}/r/${effectiveCode}` : "";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("id, created_at, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false });
      setCollabs((data as unknown as Collaborator[]) || []);
      setLoading(false);
    })();
  }, [partner.id]);

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const share = async () => {
    if (!link) return;
    const text = `Você foi convidado(a) para ser colaborador(a) da ${partner.fantasy_name} no FitMind Club. Crie sua conta:`;
    if (navigator.share) {
      try { await navigator.share({ title: partner.fantasy_name, text, url: link }); } catch { /* ignore */ }
    } else {
      copy();
    }
  };

  if (!effectiveCode) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
        <p className="text-sm text-white/70">Código de indicação ainda não gerado. Atualize a página em instantes.</p>
      </div>
    );
  }

  const MAX_COLLABS = 7;
  const reached = collabs.length >= MAX_COLLABS;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Users className="h-7 w-7 text-primary mx-auto mb-2" />
        <h2 className="text-base font-bold text-white">Convidar colaboradores</h2>
        <p className="mt-1 text-xs text-white/50">
          Compartilhe este link com seus colaboradores. Eles entram vinculados à <b className="text-white/80">{partner.fantasy_name}</b>, recebem todos os <b className="text-white/80">produtos gratuitos</b>, <b className="text-white/80">desafios</b> e acesso completo ao painel do aluno enquanto sua empresa tiver produtos ativos.
        </p>
        <p className="mt-2 text-[11px] text-white/60">
          Limite: <b className={reached ? "text-red-400" : "text-primary"}>{collabs.length} / {MAX_COLLABS}</b> colaboradores
        </p>

        {!reached ? (
          <>
            <div className="mt-4 inline-block bg-white p-3 rounded-xl">
              <QRCodeSVG value={link} size={180} />
            </div>

            <div className="mt-3 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 break-all">{link}</div>
            <p className="mt-2 text-[10px] text-white/40">Código: <span className="font-mono text-white/70">{effectiveCode}</span></p>

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
            Limite de {MAX_COLLABS} colaboradores atingido. Remova alguém para liberar novas vagas.
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
                  <p className="text-[10px] text-primary/80 truncate font-semibold">Colaborador · {partner.fantasy_name}</p>
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

function PartnerVisitsModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<import("@/lib/partner-visits.functions").PartnerVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const { getMyPartnerVisits } = await import("@/lib/partner-visits.functions");
        const data = await getMyPartnerVisits();
        setRows(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const months = Array.from(new Set(rows.map((r) => r.visited_at.slice(0, 7)))).sort().reverse();

  const filtered = rows.filter((r) => {
    if (month !== "all" && r.visited_at.slice(0, 7) !== month) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!`${r.student_name} ${r.student_email || ""} ${r.coach_name || ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalUnique = new Set(filtered.map((r) => r.student_id)).size;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 max-h-[90vh] flex flex-col" style={{ backgroundColor: "#111" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white">Visitas registradas</h3>
            <p className="text-[11px] text-white/50">{filtered.length} visita(s) · {totalUnique} aluno(s) único(s)</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/5"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-white/5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou coach..."
            className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
          />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">Todos os meses</option>
            {months.map((m) => {
              const [y, mo] = m.split("-");
              const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              return <option key={m} value={m}>{label}</option>;
            })}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-white/50 py-10">Nenhuma visita no filtro selecionado.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
                  {r.student_photo ? (
                    <img src={r.student_photo} alt={r.student_name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">
                      {r.student_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{r.student_name}</p>
                    <p className="text-[11px] text-white/50 truncate">
                      Coach: {r.coach_name || "—"} · Total: {r.student_visit_count} visita{r.student_visit_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-[11px] text-white/50 shrink-0">{new Date(r.visited_at).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
