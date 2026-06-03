import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Building2, Package, Image as ImageIcon, QrCode, UserCog, LogOut, Plus, Loader2, AlertTriangle, Check, X, Trash2, Save, DollarSign, Gift, ShoppingBag, Users, Copy, Share2, TrendingUp, CalendarDays, Wallet } from "lucide-react";

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
import { WalletTab } from "@/components/coach/tabs/WalletTab";
import { NetworkTreeTab } from "@/components/coach/tabs/NetworkTreeTab";
import type { CoachContext } from "@/routes/coach";


export const Route = createFileRoute("/partner")({
  head: () => ({ meta: [{ title: "Painel Parceiro — FitMind Club" }] }),
  component: PartnerPanel,
});

type Tab = "overview" | "products" | "timeline" | "qrcode" | "freebies" | "store" | "collaborators" | "network" | "wallet" | "profile" | "fitmind_calendar";


interface Partner {
  id: string; profile_id: string; fantasy_name: string; description: string | null;
  photo_url: string | null; cover_url: string | null; whatsapp: string | null;
  instagram: string | null; facebook: string | null; website: string | null;
  address: string | null; city: string | null; state: string | null;
  status: string; document: string | null; document_type: string | null;
  referral_code: string | null; referral_link: string | null;
}

interface Product {
  id: string; partner_id: string; kind: "free" | "paid"; name: string;
  description: string | null; image_url: string | null; price: number; stock: number | null;
  redemption_instructions: string | null; status: string; admin_notes: string | null;
  is_active_by_partner: boolean;
  price_input_mode?: "charge" | "receive";
  coach_commission_percentage?: number;
  partner_net_amount?: number;
  coach_commission_amount?: number;
  network_l1_amount?: number;
  network_l2_amount?: number;
  network_l3_amount?: number;
  section_id?: string | null;
  category_id?: string | null;
}

interface Post { id: string; image_url: string; caption: string | null; created_at: string; }

function PartnerPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visits, setVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [otherRoles, setOtherRoles] = useState<{ admin: boolean; coach: boolean; student: boolean }>({ admin: false, coach: false, student: false });
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { navigate({ to: "/login" }); return; }
    const { data: profile } = await supabase.from("profiles").select("id, role").eq("user_id", userData.user.id).maybeSingle();
    if (!profile) { setLoading(false); return; }
    const { data: p } = await supabase.from("partners" as never).select("*").eq("profile_id" as never, profile.id).maybeSingle();
    if (!p) { setLoading(false); return; }
    const pt = p as unknown as Partner;
    setPartner(pt);
    const [pr, ps, v, coach, student] = await Promise.all([
      supabase.from("partner_products" as never).select("*").eq("partner_id" as never, pt.id).order("created_at" as never, { ascending: false }),
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

  const baseTabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "overview", label: "Início", icon: Building2 },
    { key: "products", label: "Produtos", icon: Package },
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
    { key: "fitmind_calendar" as Tab, label: "Agenda", icon: CalendarDays },
    { key: "collaborators" as Tab, label: "Colaboradores", icon: Users },
    { key: "profile" as Tab, label: "Perfil", icon: UserCog },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      <header className="border-b border-white/5 px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#111" }}>
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold text-white">{partner.fantasy_name}</p>
            <p className="text-[10px] text-white/40">Status: <span className={partner.status === "approved" ? "text-green-400" : "text-yellow-400"}>{partner.status}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher current="partner" />
          <button onClick={signOut} className="ml-1 text-white/60 hover:text-white"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      {partner.status !== "approved" && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-xs text-yellow-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Sua empresa aguarda aprovação do admin. Você já pode preencher o perfil e cadastrar produtos.
        </div>
      )}

      <main className="px-4 py-4 pb-24 max-w-3xl mx-auto">
        {tab === "overview" && <Overview partner={partner} products={products} visits={visits} hasActiveFree={hasActiveFree} pendingCount={pendingCount} />}
        {tab === "products" && <ProductsPanel partner={partner} products={products} hasActiveFree={hasActiveFree} onReload={load} />}
        {tab === "timeline" && <TimelinePanel partner={partner} posts={posts} onReload={load} />}
        {tab === "qrcode" && <QrCodePanel partner={partner} />}
        {tab === "freebies" && hasActiveFree && <CoachBenefitsTab forceActive />}
        {tab === "store" && hasActiveFree && <StorePage />}
        {tab === "profile" && <ProfilePanel partner={partner} onReload={load} />}
        {tab === "fitmind_calendar" && <FitmindCalendar />}
        {tab === "collaborators" && <CollaboratorsPanel partner={partner} />}
        {tab === "network" && (coachCtx ? <NetworkTreeTab coach={coachCtx} /> : <MyNetworkPanel />)}
        {tab === "wallet" && <WalletTab />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 flex overflow-x-auto" style={{ backgroundColor: "#111" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 min-w-[64px] py-2.5 flex flex-col items-center gap-0.5 text-[10px] ${tab === t.key ? "text-primary" : "text-white/50"}`}>
            <t.icon className="h-5 w-5" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Overview({ partner, products, visits, hasActiveFree, pendingCount }: { partner: Partner; products: Product[]; visits: number; hasActiveFree: boolean; pendingCount: number }) {
  const approved = products.filter(p => p.status === "approved" && p.is_active_by_partner).length;
  const [showVisits, setShowVisits] = useState(false);
  return (
    <div className="space-y-3">
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
  const [uploading, setUploading] = useState(false);

  const blank = (): Partial<Product> => ({
    partner_id: partner.id,
    kind: hasActiveFree ? "paid" : "free",
    name: "", description: "", image_url: "", price: 0, stock: null,
    redemption_instructions: "", is_active_by_partner: true,
    price_input_mode: "charge",
    coach_commission_percentage: 10,
    partner_net_amount: 0,
    section_id: null,
    category_id: null,
  });

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `partners/${partner.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setEditing(e => e ? { ...e, image_url: data.publicUrl } : e);
    setUploading(false);
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Informe o nome do produto.");

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
        partner_net_amount: b.partnerNet,
        coach_commission_amount: b.coachCommission,
        network_l1_amount: b.networkL1,
        network_l2_amount: b.networkL2,
        network_l3_amount: b.networkL3,
      };
    }

    const payload = { ...editing, ...extra, partner_id: partner.id, status: "pending" as const, admin_notes: null };
    if (editing.id) {
      const { id, ...up } = payload;
      const { error } = await supabase.from("partner_products" as never).update(up as never).eq("id" as never, id!);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("partner_products" as never).insert(payload as never);
      if (error) return toast.error(error.message);
    }
    toast.success("Salvo. Aguardando aprovação do admin.");
    setEditing(null); onReload();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("partner_products" as never).delete().eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); onReload();
  };

  const toggleActive = async (p: Product) => {
    const { error } = await supabase.from("partner_products" as never).update({ is_active_by_partner: !p.is_active_by_partner } as never).eq("id" as never, p.id);
    if (error) return toast.error(error.message);
    onReload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Meus produtos</h2>
        <button onClick={() => setEditing(blank())} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Novo</button>
      </div>

      {products.length === 0 && <p className="text-sm text-white/40 text-center py-8">Nenhum produto cadastrado ainda.</p>}

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
            {p.image_url ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} /> : <div className="h-16 w-16 rounded bg-white/5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.kind === "free" ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>{p.kind === "free" ? "Gratuito" : "Pago"}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(p.status)}`}>{p.status}</span>
              </div>
              {p.kind === "paid" && (
                <div className="mt-0.5 text-[11px] text-white/60">
                  <span className="text-primary font-semibold">R$ {Number(p.price).toFixed(2)}</span>
                  {typeof p.partner_net_amount === "number" && p.partner_net_amount > 0 && (
                    <span className="ml-2">• Líquido: <span className="text-green-400">R$ {p.partner_net_amount.toFixed(2)}</span></span>
                  )}
                  {typeof p.coach_commission_percentage === "number" && (
                    <span className="ml-2">• Coach: {p.coach_commission_percentage}%</span>
                  )}
                </div>
              )}
              {p.status === "rejected" && p.admin_notes && <p className="text-[10px] text-red-300 mt-1">Obs.: {p.admin_notes}</p>}
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => setEditing(p)} className="text-[11px] text-white/60 hover:text-white">Editar</button>
                <button onClick={() => toggleActive(p)} className="text-[11px] text-white/60 hover:text-white">{p.is_active_by_partner ? "Desativar" : "Ativar"}</button>
                <button onClick={() => remove(p.id)} className="text-[11px] text-red-400"><Trash2 className="inline h-3 w-3" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-white">{editing.id ? "Editar" : "Novo"} produto</h3>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-white/60" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-white/60">Tipo</label>
                <select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as "free" | "paid" })} disabled={editing.kind === "paid" && !hasActiveFree && !editing.id} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-white">
                  <option value="free">Gratuito (obrigatório ter ao menos 1)</option>
                  <option value="paid" disabled={!hasActiveFree && !editing.id}>Pago / Patrocinado {!hasActiveFree && !editing.id ? "(crie 1 gratuito antes)" : ""}</option>
                </select>
              </div>
              <Field label="Nome"><input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} className="field-input" /></Field>
              <Field label="Descrição"><textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="field-input" /></Field>
              <Field label="Imagem">
                {editing.image_url ? (
                  <div className="relative"><img src={editing.image_url} className="h-32 w-full rounded object-cover" /><button onClick={() => setEditing({ ...editing, image_url: "" })} className="absolute top-1 right-1 bg-black/70 rounded p-1"><X className="h-3 w-3 text-white" /></button></div>
                ) : (
                  <label className="flex h-24 cursor-pointer items-center justify-center rounded border border-dashed border-white/20">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-white/40" />}
                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                )}
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

              <CategoryPicker
                ownerOnly
                sectionId={editing.section_id}
                categoryId={editing.category_id}
                onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
              />

              <Field label="Instruções de resgate"><textarea value={editing.redemption_instructions || ""} onChange={e => setEditing({ ...editing, redemption_instructions: e.target.value })} rows={2} className="field-input" placeholder="Ex: Apresente o QR Code da carteirinha na loja" /></Field>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-white">Cancelar</button>
              <button onClick={save} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Save className="inline h-4 w-4 mr-1" /> Salvar</button>
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
        <Field label="Preço cobrado do cliente">
          <CurrencyInputBRL value={charge} onChange={updateCharge} />
        </Field>
      ) : (
        <Field label="Quanto você quer receber líquido">
          <CurrencyInputBRL value={receive} onChange={updateReceive} />
          <p className="mt-1 text-[10px] text-white/40">O preço cobrado é aumentado automaticamente para cobrir as taxas (igual simulação de cartão em apps bancários).</p>
        </Field>
      )}

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
        <BreakdownLine label="− Imposto (6%)" value={-breakdown.tax} muted />
        <BreakdownLine label="− Taxa do sistema (R$ 20)" value={-breakdown.systemFee} muted />
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

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `partners/${partner.id}/posts/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file);
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
          <label className="flex h-24 cursor-pointer items-center justify-center rounded border border-dashed border-white/20">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-white/40" />}
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

interface ScanResult { ok: boolean; student_name?: string; student_avatar?: string | null; partner_name?: string; visited_at?: string; error?: string; }

function StudentQrScanner({ partner }: { partner: Partner }) {
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastValue, setLastValue] = useState<string>("");

  const extractStudentId = (raw: string): string | null => {
    const trimmed = raw.trim();
    // Accept full URL like .../checkin/<uuid> or bare UUID
    const m = trimmed.match(/checkin\/([0-9a-f-]{36})/i);
    if (m) return m[1];
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
    return null;
  };

  const onDetected = async (value: string) => {
    if (processing || value === lastValue) return;
    setLastValue(value);
    const studentId = extractStudentId(value);
    if (!studentId) {
      toast.error("QR inválido. Use o QR da carteirinha do aluno.");
      setTimeout(() => setLastValue(""), 1500);
      return;
    }
    setProcessing(true);
    setScanning(false);
    const { data, error } = await supabase.rpc("partner_scan_student" as never, { _student_id: studentId } as never);
    if (error) {
      setResult({ ok: false, error: error.message });
    } else {
      const r = data as unknown as ScanResult;
      setResult({ ...r, ok: true });
      toast.success(`Check-in: ${r.student_name}`);
    }
    setProcessing(false);
  };

  const reset = () => { setResult(null); setLastValue(""); setScanning(true); };

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
        <p className="text-xs text-white/60 text-center mb-2">Aponte a câmera para o QR Code da carteirinha do aluno</p>
        {scanning && !result && <QrScannerView onDetected={onDetected} />}
        {processing && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  const upload = async (file: File, field: "photo_url" | "cover_url") => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `partners/${partner.id}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setForm({ ...form, [field]: data.publicUrl });
    setUploading(false);
  };

  const save = async () => {
    setSaving(true);
    const { id, profile_id, status, ...up } = form;
    const { error } = await supabase.from("partners" as never).update(up as never).eq("id" as never, partner.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado"); onReload();
  };

  return (
    <div className="space-y-3 rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <Field label="Foto / Logo">
        <div className="flex items-center gap-3">
          {form.photo_url && <img src={form.photo_url} className="h-16 w-16 rounded-full object-cover" />}
          <label className="cursor-pointer rounded bg-white/10 px-3 py-1.5 text-xs text-white">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Trocar foto"}
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0], "photo_url")} />
          </label>
        </div>
      </Field>
      <Field label="Nome fantasia"><input className="field-input" value={form.fantasy_name} onChange={e => setForm({ ...form, fantasy_name: e.target.value })} /></Field>
      <Field label="Descrição"><textarea className="field-input" rows={3} value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="WhatsApp"><input className="field-input" value={form.whatsapp || ""} onChange={e => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} /></Field>
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
    </div>
  );
}

type Collaborator = {
  id: string;
  created_at: string;
  profiles: { name: string; email: string | null; phone: string | null; photo_url: string | null } | null;
};

function CollaboratorsPanel({ partner }: { partner: Partner }) {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const link = partner.referral_code ? `${window.location.origin}/r/${partner.referral_code}` : "";

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

  if (!partner.referral_code) {
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
            <p className="mt-2 text-[10px] text-white/40">Código: <span className="font-mono text-white/70">{partner.referral_code}</span></p>

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2 sm:p-4" onClick={onClose}>
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
