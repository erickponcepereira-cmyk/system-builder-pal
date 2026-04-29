import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users, TrendingUp, Wallet, Plus, BarChart3, User, LogOut,
  Menu, X, Calculator, Trophy, Copy, Share2, ArrowUpRight, ClipboardList, CalendarCheck,
  Package, ShoppingBag, Gift, Network, Crown, UserRound, Save, Mail, Phone, MapPin,
  BookOpen, Dumbbell, Percent, Star, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentBadge } from "@/components/coach/PatentBadge";
import { GoalsCard } from "@/components/coach/GoalsCard";
import { CareerProgress } from "@/components/coach/CareerProgress";
import { RankingTable } from "@/components/coach/RankingTable";
import { MinhaRede } from "@/components/coach/MinhaRede";
import FitMindShape, { type FitMindAssessment, type FitMindClient } from "@/components/coach/FitMindShape";
import fitmindLogo from "@/assets/fitmind-logo.png";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Painel Coach — FitMind Club" },
      { name: "description", content: "Gerencie sua rede, vendas e comissões." },
    ],
  }),
  component: CoachDashboard,
});

type Tab = "overview" | "network" | "products" | "profile" | "students" | "tree" | "physicalStore" | "digitalStore" | "benefits" | "evaluate" | "attendance" | "wallet" | "career";

const money = (value: number | null | undefined) =>
  `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CoachContext {
  profileId: string;
  coachId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  bio: string;
  patent: string | null;
  referralCode: string;
  referralLink: string;
  uplineCoachId: string | null;
  totalActiveStudents: number;
  totalSales: number;
}

function useCoachContext() {
  const [coach, setCoach] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = userData.user
      ? await supabase.from("profiles").select("id,name,email,phone,city,state,bio,patent").eq("user_id", userData.user.id).maybeSingle()
      : { data: null };
    const { data: coachRow } = profile?.id
      ? await supabase.from("coaches").select("id,referral_code,referral_link,upline_coach_id,total_active_students,total_sales").eq("profile_id", profile.id).maybeSingle()
      : { data: null };

    setCoach(profile && coachRow ? {
      profileId: profile.id,
      coachId: coachRow.id,
      name: profile.name || "Coach",
      email: profile.email || "",
      phone: profile.phone || "",
      city: profile.city || "",
      state: profile.state || "",
      bio: profile.bio || "",
      patent: profile.patent || null,
      referralCode: coachRow.referral_code || "",
      referralLink: coachRow.referral_link || "",
      uplineCoachId: coachRow.upline_coach_id || null,
      totalActiveStudents: Number(coachRow.total_active_students || 0),
      totalSales: Number(coachRow.total_sales || 0),
    } : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  return { coach, loading, reload: load, setCoach };
}

function CoachDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [coachName, setCoachName] = useState("Coach");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const { coach: coachContext, loading: coachContextLoading, reload: reloadCoach, setCoach: setCoachContext } = useCoachContext();
  const referralCode = coachContext?.referralCode || "FITMIND";
  const referralLink = coachContext?.referralLink || `https://fitmindclub.app/r/${referralCode}`;

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      if (!user) {
        navigate({ to: "/login", replace: true });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: coach } = profile
        ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
        : { data: null };

      if (!active) return;
      if (profile?.role === "admin") {
        navigate({ to: "/admin", replace: true });
        return;
      }
      if (!["coach", "manager", "director"].includes(profile?.role || "") && !coach) {
        navigate({ to: "/student", replace: true });
        return;
      }

      if (profile?.name) setCoachName(profile.name.split(" ")[0]);
      setCheckingAccess(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  const navItems: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: "Visão Geral", icon: BarChart3 },
    { id: "network", label: "Minha Rede", icon: Users },
    { id: "products", label: "Esteira de Produtos", icon: Package },
    { id: "students", label: "Base de Alunos", icon: UserRound },
    { id: "tree", label: "Árvore da Rede", icon: Network },
    { id: "physicalStore", label: "Loja Física", icon: ShoppingBag },
    { id: "digitalStore", label: "Loja Digital", icon: BookOpen },
    { id: "benefits", label: "Benefícios", icon: Gift },
    { id: "evaluate", label: "Avaliar Aluno", icon: ClipboardList },
    { id: "attendance", label: "Frequência", icon: CalendarCheck },
    { id: "wallet", label: "Carteira", icon: Wallet },
    { id: "career", label: "Carreira", icon: Trophy },
    { id: "profile", label: "Meu Perfil", icon: User },
  ];

  if (checkingAccess || coachContextLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile header */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-white/5 px-4 backdrop-blur-xl lg:hidden"
        style={{ backgroundColor: "rgba(10,10,10,0.9)" }}
      >
        <div className="flex items-center gap-2">
<img src={fitmindLogo} alt="FitMind Club" className="h-9 w-9 object-contain" />
          <span className="font-bold text-white">FitMind Club</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-white/5 p-4 transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="mb-8 flex items-center gap-2 px-2 pt-14 lg:pt-0">
<img src={fitmindLogo} alt="FitMind Club" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold text-white">FitMind Club</span>
          <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
            Coach
          </span>
        </div>

        <div className="mb-6 rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
              {coachName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{coachName}</p>
              <PatentBadge patent="senior_coach" size="sm" />
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors w-full text-left ${
                  isActive
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/40 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {activeTab === "overview" && (
            <OverviewTab coachName={coachName} referralLink={referralLink} onCopy={copyReferral} />
          )}
          {activeTab === "network" && <NetworkTab referralLink={referralLink} onCopy={copyReferral} />}
          {activeTab === "products" && <ProductsTrackTab />}
          {activeTab === "profile" && <CoachProfileTab coach={coachContext} onSaved={reloadCoach} onLocalChange={setCoachContext} />}
          {activeTab === "students" && <CoachStudentsTab coachId={coachContext?.coachId || ""} />}
          {activeTab === "tree" && <NetworkTreeTab coach={coachContext} />}
          {activeTab === "physicalStore" && <PhysicalStoreTab />}
          {activeTab === "digitalStore" && <DigitalStoreTab />}
          {activeTab === "benefits" && <CoachBenefitsTab />}
          {activeTab === "evaluate" && <EvaluateTab />}
          {activeTab === "attendance" && <AttendanceTab />}
          {activeTab === "wallet" && <WalletTab />}
          {activeTab === "career" && <CareerTab />}
        </div>
      </main>
    </div>
  );
}

/* ---------- TABS ---------- */

function OverviewTab({
  coachName,
  referralLink,
  onCopy,
}: {
  coachName: string;
  referralLink: string;
  onCopy: () => void;
}) {
  const stats = [
    { label: "Alunos ativos", value: "24", change: "+3", icon: Users },
    { label: "Vendas/mês", value: "R$ 3.680", change: "+18%", icon: TrendingUp },
    { label: "Comissões", value: "R$ 1.104", change: "+22%", icon: BarChart3 },
    { label: "Saldo", value: "R$ 2.450", change: "Disponível", icon: Wallet },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {coachName}! 💪</h1>
          <p className="text-sm text-white/50">Resumo do seu mês</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova venda
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="text-xs text-white/50">{s.label}</p>
              </div>
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-[10px] text-success mt-0.5">{s.change}</p>
            </div>
          );
        })}
      </div>

      {/* Referral link */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.7))" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-foreground/80 font-bold">
              Seu link de indicação
            </p>
            <p className="text-base font-bold text-primary-foreground mt-0.5">
              Compartilhe e ganhe comissões
            </p>
          </div>
          <Share2 className="h-5 w-5 text-primary-foreground/80" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5">
          <span className="flex-1 text-xs text-primary-foreground truncate font-mono">
            {referralLink}
          </span>
          <button
            onClick={onCopy}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30"
          >
            <Copy className="h-3.5 w-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalsCard />
        <CareerProgress
          currentMonths={3}
          currentStudents={24}
          isTopSeller={false}
        />
      </div>
    </>
  );
}

function NetworkTab({ referralLink, onCopy }: { referralLink: string; onCopy: () => void }) {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Minha Rede</h1>
        <p className="text-sm text-white/50">Acompanhe sua rede MLM e simule ganhos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Alunos diretos</p>
          <p className="text-3xl font-bold text-white">24</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +3 este mês
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Rede total (3 níveis)</p>
          <p className="text-3xl font-bold text-white">187</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +24 este mês
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <MinhaRede />
      </div>

      <div className="mt-4">
        <RankingTable />
      </div>
    </>
  );
}

type ProductRow = { id: string; name: string; subtitle: string | null; description: string | null; price: number | null; original_price: number | null; is_featured: boolean | null; commission_coach: number | null; commission_level1: number | null; commission_level2: number | null; commission_level3: number | null; badge_label: string | null; status: string | null };
type StoreProductRow = { id: string; name: string; description: string | null; price: number; original_price: number | null; category: string | null; stock: number | null; is_herbalife: boolean | null; status: string | null };
type DigitalProductRow = { id: string; title: string; description: string | null; price: number; original_price: number | null; type: string; duration_hours: number | null; access_days: number | null; is_featured: boolean | null; instructor: string | null; status: string | null };
type BenefitRow = { id: string; name: string; description: string | null; discount_info: string | null; coupon_code: string | null; category: string | null; website_url: string | null };

function ProductsTrackTab() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,subtitle,description,price,original_price,is_featured,commission_coach,commission_level1,commission_level2,commission_level3,badge_label,status")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar produtos disponíveis");
      setProducts((data as ProductRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const featured = products.find((product) => product.is_featured) || products[0];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Esteira de Produtos</h1>
        <p className="text-sm text-white/50">Produtos disponíveis e ganhos estimados por venda</p>
      </div>

      {featured && (
        <div className="mb-6 rounded-2xl border border-primary/40 p-5" style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.22), #1A1A1A 58%)" }}>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase text-primary">Produto em destaque</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{featured.name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-white/60">{featured.subtitle || featured.description || "Condição especial para foco de venda neste ciclo."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Venda", money(featured.price)],
                ["Você", `${featured.commission_coach || 0}%`],
                ["N1", `${featured.commission_level1 || 0}%`],
                ["N2/N3", `${featured.commission_level2 || 0}% / ${featured.commission_level3 || 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-black/25 p-3">
                  <p className="text-[10px] uppercase text-white/40">{label}</p>
                  <p className="text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando produtos...</p> : products.length === 0 ? <p className="text-sm text-white/50">Nenhum produto ativo encontrado.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {products.map((product, index) => {
              const coachGain = Number(product.price || 0) * Number(product.commission_coach || 0) / 100;
              return (
                <div key={product.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-white/35">Etapa {index + 1}</p>
                      <h3 className="text-sm font-bold text-white">{product.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-white/45">{product.subtitle || product.description || "Produto disponível para venda."}</p>
                    </div>
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-bold text-primary">{product.badge_label || "Ativo"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Preço</span><p className="font-bold text-white">{money(product.price)}</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Ganho direto</span><p className="font-bold text-success">{money(coachGain)}</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Rede N1</span><p className="font-bold text-white">{product.commission_level1 || 0}%</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Rede N2/N3</span><p className="font-bold text-white">{product.commission_level2 || 0}% / {product.commission_level3 || 0}%</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function CoachProfileTab({ coach, onSaved, onLocalChange }: { coach: CoachContext | null; onSaved: () => void; onLocalChange: (value: CoachContext | null) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", city: "", state: "", bio: "", pix_key: "", pix_key_type: "cpf" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coach) return;
    setForm((current) => ({ ...current, name: coach.name, phone: coach.phone, city: coach.city, state: coach.state, bio: coach.bio }));
  }, [coach]);

  const save = async () => {
    if (!coach) return;
    if (!form.name.trim()) return toast.error("Informe seu nome para salvar o perfil");
    setSaving(true);
    const { error: profileError } = await supabase.from("profiles").update({ name: form.name.trim(), phone: form.phone.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null, bio: form.bio.trim() || null }).eq("id", coach.profileId);
    const { error: coachError } = await supabase.from("coaches").update({ pix_key: form.pix_key.trim() || null, pix_key_type: form.pix_key_type || null }).eq("id", coach.coachId);
    setSaving(false);
    if (profileError || coachError) return toast.error("Não foi possível salvar. Verifique os dados e tente novamente.");
    onLocalChange({ ...coach, name: form.name.trim(), phone: form.phone.trim(), city: form.city.trim(), state: form.state.trim(), bio: form.bio.trim() });
    toast.success("Perfil atualizado");
    onSaved();
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
        <p className="text-sm text-white/50">Informações do coach e dados para contato</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ key: "name", label: "Nome", icon: User }, { key: "phone", label: "Telefone", icon: Phone }, { key: "city", label: "Cidade", icon: MapPin }, { key: "state", label: "Estado", icon: MapPin }].map((field) => {
              const Icon = field.icon;
              return <label key={field.key} className="text-xs text-white/50"><span className="mb-1 flex items-center gap-1.5"><Icon className="h-3 w-3" />{field.label}</span><input className="field-control" value={form[field.key as keyof typeof form]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} /></label>;
            })}
            <label className="sm:col-span-2 text-xs text-white/50"><span className="mb-1 block">Bio / apresentação</span><textarea className="field-control min-h-28" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Conte sua especialidade, cidade de atendimento e foco de transformação." /></label>
            <label className="text-xs text-white/50"><span className="mb-1 block">Tipo de chave PIX</span><select className="field-control" value={form.pix_key_type} onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })}><option value="cpf">CPF</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></label>
            <label className="text-xs text-white/50"><span className="mb-1 block">Chave PIX</span><input className="field-control" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></label>
          </div>
          <Button onClick={save} disabled={saving} className="mt-4"><Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar perfil"}</Button>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary">{(coach?.name || "C").charAt(0)}</div>
          <h2 className="text-lg font-bold text-white">{coach?.name || "Coach"}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50"><Mail className="h-3 w-3" />{coach?.email || "E-mail não informado"}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Alunos ativos</p><p className="text-lg font-bold text-white">{coach?.totalActiveStudents || 0}</p></div>
            <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] text-white/40">Vendas</p><p className="text-lg font-bold text-white">{money(coach?.totalSales)}</p></div>
          </div>
          <div className="mt-3 rounded-xl bg-black/20 p-3"><p className="text-[10px] uppercase text-white/35">Código</p><p className="font-mono text-sm font-bold text-primary">{coach?.referralCode || "—"}</p></div>
        </div>
      </div>
    </>
  );
}

function CoachStudentsTab({ coachId }: { coachId: string }) {
  const [students, setStudents] = useState<{ id: string; current_weight: number | null; goal_weight: number | null; completed_coach_course: boolean | null; created_at: string | null; profiles: { name: string; email: string; phone: string | null; city: string | null; state: string | null } | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,current_weight,goal_weight,completed_coach_course,created_at,profiles!students_profile_id_fkey(name,email,phone,city,state)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      if (error) toast.error("Erro ao carregar alunos da base");
      setStudents((data as unknown as typeof students) || []);
      setLoading(false);
    })();
  }, [coachId]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Base de Alunos</h1>
        <p className="text-sm text-white/50">Todos os alunos ligados diretamente ao seu perfil</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando alunos...</p> : students.length === 0 ? <p className="text-sm text-white/50">Nenhum aluno ligado a você ainda.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {students.map((student) => (
              <div key={student.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white">{student.profiles?.name || "Aluno"}</h3>
                    <p className="truncate text-xs text-white/45">{student.profiles?.email || "Sem e-mail"}</p>
                    <p className="mt-1 text-[10px] text-white/35">{student.profiles?.phone || "Sem telefone"} {student.profiles?.city ? `· ${student.profiles.city}/${student.profiles.state || ""}` : ""}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${student.completed_coach_course ? "bg-success/20 text-success" : "bg-white/10 text-white/60"}`}>{student.completed_coach_course ? "Curso coach" : "Aluno"}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Peso atual</p><p className="font-bold text-white">{student.current_weight ? `${student.current_weight} kg` : "—"}</p></div>
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Meta</p><p className="font-bold text-white">{student.goal_weight ? `${student.goal_weight} kg` : "—"}</p></div>
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Entrada</p><p className="font-bold text-white">{student.created_at ? new Date(student.created_at).toLocaleDateString("pt-BR") : "—"}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

type TreeCoach = { id: string; profile_id: string; upline_coach_id: string | null; total_active_students: number | null; profiles: { name: string; email: string; patent: string | null } | null };

function NetworkTreeTab({ coach }: { coach: CoachContext | null }) {
  const [upline, setUpline] = useState<TreeCoach | null>(null);
  const [downline, setDownline] = useState<TreeCoach[]>([]);
  const [students, setStudents] = useState<{ id: string; profiles: { name: string; email: string } | null }[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!coach?.coachId) return;
    (async () => {
      if (coach.uplineCoachId) {
        const { data } = await supabase.from("coaches").select("id,profile_id,upline_coach_id,total_active_students,profiles!coaches_profile_id_fkey(name,email,patent)").eq("id", coach.uplineCoachId).maybeSingle();
        setUpline(data as unknown as TreeCoach | null);
      }
      const [{ data: coaches }, { data: studentRows }] = await Promise.all([
        supabase.from("coaches").select("id,profile_id,upline_coach_id,total_active_students,profiles!coaches_profile_id_fkey(name,email,patent)").eq("upline_coach_id", coach.coachId),
        supabase.from("students").select("id,profiles!students_profile_id_fkey(name,email)").eq("coach_id", coach.coachId),
      ]);
      setDownline((coaches as unknown as TreeCoach[]) || []);
      setStudents((studentRows as unknown as typeof students) || []);
    })();
  }, [coach?.coachId, coach?.uplineCoachId]);

  const PersonNode = ({ title, subtitle, tone = "white" }: { title: string; subtitle: string; tone?: "primary" | "success" | "white" }) => (
    <div className={`rounded-xl border p-4 ${tone === "primary" ? "border-primary/40 bg-primary/10" : tone === "success" ? "border-success/30 bg-success/10" : "border-white/10 bg-white/5"}`}>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-xs text-white/45">{subtitle}</p>
    </div>
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Árvore da Rede</h1>
        <p className="text-sm text-white/50">Quem está acima, você no centro e quem está abaixo</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-white/35">Acima de você</p>
            {upline ? <PersonNode title={upline.profiles?.name || "Coach acima"} subtitle={upline.profiles?.email || "Upline"} /> : <PersonNode title="Sem coach acima" subtitle="Você está no topo desta ramificação" />}
          </div>
          <div className="pl-5 border-l border-primary/40">
            <PersonNode title={coach?.name || "Você"} subtitle={`${coach?.referralCode || "—"} · ${coach?.totalActiveStudents || 0} alunos diretos`} tone="primary" />
          </div>
          <div className="pl-10 border-l border-white/10">
            <button onClick={() => setOpen(!open)} className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-white/45">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Abaixo de você</button>
            {open && <div className="grid gap-3 md:grid-cols-2">
              {downline.map((item) => <PersonNode key={item.id} title={item.profiles?.name || "Coach"} subtitle={`Coach · ${item.total_active_students || 0} alunos`} tone="success" />)}
              {students.map((item) => <PersonNode key={item.id} title={item.profiles?.name || "Aluno"} subtitle={item.profiles?.email || "Aluno direto"} />)}
              {downline.length + students.length === 0 && <p className="text-sm text-white/50">Nenhum aluno ou coach abaixo ainda.</p>}
            </div>}
          </div>
        </div>
      </div>
    </>
  );
}

function PhysicalStoreTab() {
  const [items, setItems] = useState<StoreProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("store_products").select("id,name,description,price,original_price,category,stock,is_herbalife,status").eq("status", "active").order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar loja física");
      setItems((data as StoreProductRow[]) || []);
      setLoading(false);
    })();
  }, []);
  return <StoreGrid title="Loja de Produtos Físicos" subtitle="Produtos para demonstrar a clientes e opções com condição de coach" items={items} loading={loading} kind="physical" />;
}

function DigitalStoreTab() {
  const [items, setItems] = useState<DigitalProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("digital_products").select("id,title,description,price,original_price,type,duration_hours,access_days,is_featured,instructor,status").eq("status", "active").order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar loja digital");
      setItems((data as DigitalProductRow[]) || []);
      setLoading(false);
    })();
  }, []);
  return <StoreGrid title="Loja de Produtos Digitais" subtitle="Cursos, mentorias e materiais para venda e uso do coach" items={items} loading={loading} kind="digital" />;
}

function StoreGrid({ title, subtitle, items, loading, kind }: { title: string; subtitle: string; items: (StoreProductRow | DigitalProductRow)[]; loading: boolean; kind: "physical" | "digital" }) {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando produtos...</p> : items.length === 0 ? <p className="text-sm text-white/50">Nenhum produto ativo encontrado.</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const isDigital = kind === "digital";
              const titleText = isDigital ? (item as DigitalProductRow).title : (item as StoreProductRow).name;
              const original = item.original_price;
              const discount = original && original > item.price ? Math.round(((original - item.price) / original) * 100) : 0;
              return (
                <div key={item.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60">{isDigital ? (item as DigitalProductRow).type : (item as StoreProductRow).category || "Produto"}</span>
                    {discount > 0 && <span className="rounded-full bg-success/20 px-2 py-1 text-[10px] font-bold text-success">-{discount}% coach</span>}
                  </div>
                  <h3 className="text-sm font-bold text-white">{titleText}</h3>
                  <p className="mt-1 line-clamp-3 min-h-12 text-xs text-white/45">{item.description || "Produto disponível para apresentação e venda."}</p>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      {original && original > item.price && <p className="text-xs text-white/35 line-through">{money(original)}</p>}
                      <p className="text-lg font-bold text-white">{money(item.price)}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">Compartilhar</Button>
                  </div>
                  <p className="mt-3 text-[10px] text-white/35">{isDigital ? `${(item as DigitalProductRow).duration_hours || 0}h · acesso ${((item as DigitalProductRow).access_days || 365)} dias` : `${(item as StoreProductRow).stock ?? 0} em estoque`}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function CoachBenefitsTab() {
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("partner_benefits").select("id,name,description,discount_info,coupon_code,category,website_url").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar benefícios");
      setBenefits((data as BenefitRow[]) || []);
      setLoading(false);
    })();
  }, []);
  const fallback = benefits.length ? benefits : [
    { id: "showcase", name: "Benefícios para apresentar a clientes", description: "Use esta aba para demonstrar vantagens, bônus e condições comerciais durante a venda.", discount_info: "Material de apoio", coupon_code: "FITMIND", category: "Clientes", website_url: null },
    { id: "coach", name: "Desconto exclusivo Coach", description: "Área reservada para vantagens de compra e parceiros liberados para coaches ativos.", discount_info: "Condição especial", coupon_code: "COACH", category: "Coach", website_url: null },
  ];
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Benefícios</h1>
        <p className="text-sm text-white/50">Vantagens para mostrar aos clientes e descontos exclusivos do coach</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-primary/30 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <Gift className="mb-3 h-6 w-6 text-primary" />
          <h2 className="text-lg font-bold text-white">Para demonstrar ao cliente</h2>
          <p className="mt-1 text-sm text-white/55">Organize os benefícios como argumento de venda, bônus de desafio e vantagens do clube.</p>
        </div>
        <div className="rounded-2xl border border-success/30 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <Percent className="mb-3 h-6 w-6 text-success" />
          <h2 className="text-lg font-bold text-white">Exclusivo para coaches</h2>
          <p className="mt-1 text-sm text-white/55">Cupons, descontos e condições de parceiros para coaches ativos da rede.</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando benefícios...</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {fallback.map((benefit) => (
              <div key={benefit.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60">{benefit.category || "Benefício"}</span>
                  {benefit.coupon_code && <span className="rounded-full bg-primary/20 px-2 py-1 font-mono text-[10px] font-bold text-primary">{benefit.coupon_code}</span>}
                </div>
                <h3 className="text-sm font-bold text-white">{benefit.name}</h3>
                <p className="mt-1 text-xs text-white/45">{benefit.description}</p>
                <p className="mt-3 text-sm font-bold text-success">{benefit.discount_info || "Condição especial"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EvaluateTab() {
  const [clients, setClients] = useState<FitMindClient[]>([]);
  const [coachInfo, setCoachInfo] = useState({ id: "", name: "Coach FitMind", email: "", specialty: "Avaliação corporal" });

  const mapAssessment = (row: any): FitMindAssessment => ({
    id: row.id,
    clientId: row.client_id,
    date: row.assessment_date,
    method: row.method,
    age: row.age || 0,
    height: Number(row.height || 0),
    weight: Number(row.weight || 0),
    bmi: Number(row.bmi || 0),
    bodyFat: Number(row.body_fat || 0),
    skeletalMuscle: Number(row.skeletal_muscle || 0),
    muscleMass: Number(row.muscle_mass || 0),
    visceralFat: Number(row.visceral_fat || 0),
    basalMetabolism: Number(row.basal_metabolism || 0),
    bodyAge: row.body_age || 0,
    bodyWater: Number(row.body_water || 0),
    boneMass: Number(row.bone_mass || 0),
    segmentAnalysis: row.segment_analysis || undefined,
    systolicBP: row.systolic_bp || undefined,
    diastolicBP: row.diastolic_bp || undefined,
    heartRate: row.heart_rate || undefined,
    bloodGlucose: row.blood_glucose ? Number(row.blood_glucose) : undefined,
    clientNotes: row.client_notes || undefined,
    professionalNotes: row.professional_notes || undefined,
    photos: row.photos || undefined,
    nextAssessmentDate: row.next_assessment_date || undefined,
    nextAssessmentTime: row.next_assessment_time || undefined,
    groupId: row.group_id || undefined,
  });

  const loadClients = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: profile } = await supabase.from("profiles").select("id,name,email").eq("user_id", userData.user.id).maybeSingle();
    const { data: coach } = profile?.id
      ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!coach?.id) return;
    setCoachInfo({ id: coach.id, name: profile?.name || "Coach FitMind", email: profile?.email || "", specialty: "Avaliação corporal" });
    const { data, error } = await supabase
      .from("coach_evaluation_clients" as never)
      .select("*, coach_body_assessments(*)" as never)
      .eq("coach_id" as never, coach.id as never)
      .order("created_at" as never, { ascending: false });
    if (error) return toast.error("Erro ao carregar alunos da avaliação");
    setClients(((data as any[]) || []).map((row) => ({
      id: row.id,
      name: row.name,
      gender: row.gender,
      ethnicity: row.ethnicity,
      height: Number(row.height || 0),
      heightUnit: row.height_unit,
      birthDate: row.birth_date || "",
      language: row.language,
      whatsapp: row.whatsapp || "",
      email: row.email || "",
      notes: row.notes || "",
      groups: row.groups || [],
      avatar: row.avatar_url || undefined,
      assessments: (row.coach_body_assessments || []).map(mapAssessment),
    })));
  };

  useEffect(() => { loadClients(); }, []);

  const createClient = async (client: Omit<FitMindClient, "id">) => {
    if (!coachInfo.id) throw new Error("Coach não encontrado");
    if (!client.name?.trim()) throw new Error("Informe o nome do aluno");
    const { data, error } = await supabase.from("coach_evaluation_clients" as never).insert({
      coach_id: coachInfo.id,
      name: client.name.trim().slice(0, 120),
      gender: client.gender,
      ethnicity: client.ethnicity,
      height: client.height || null,
      height_unit: client.heightUnit || "cm",
      birth_date: client.birthDate || null,
      language: client.language || "pt",
      whatsapp: client.whatsapp?.slice(0, 24) || null,
      email: client.email?.trim().slice(0, 255) || null,
      notes: client.notes?.slice(0, 1000) || null,
      groups: client.groups || [],
      avatar_url: client.avatar || null,
    } as never).select("*" as never).single();
    if (error) { toast.error("Erro ao criar aluno"); throw error; }
    toast.success("Aluno criado");
    const created = data as any;
    const mapped: FitMindClient = { id: created.id, name: created.name, gender: created.gender, ethnicity: created.ethnicity, height: Number(created.height || 0), heightUnit: created.height_unit, birthDate: created.birth_date || "", language: created.language, whatsapp: created.whatsapp || "", email: created.email || "", notes: created.notes || "", groups: created.groups || [], assessments: [] };
    setClients((current) => [mapped, ...current]);
    return mapped;
  };

  const saveAssessment = async (assessment: FitMindAssessment, client: FitMindClient) => {
    if (!coachInfo.id) throw new Error("Coach não encontrado");
    const { error } = await supabase.from("coach_body_assessments" as never).insert({
      client_id: client.id,
      coach_id: coachInfo.id,
      assessment_date: assessment.date || new Date().toISOString(),
      method: assessment.method || "bioimpedance",
      age: assessment.age || null,
      height: assessment.height || null,
      weight: assessment.weight || null,
      bmi: assessment.bmi || null,
      body_fat: assessment.bodyFat || null,
      skeletal_muscle: assessment.skeletalMuscle || null,
      muscle_mass: assessment.muscleMass || null,
      visceral_fat: assessment.visceralFat || null,
      basal_metabolism: assessment.basalMetabolism || null,
      body_age: assessment.bodyAge || null,
      body_water: assessment.bodyWater || null,
      bone_mass: assessment.boneMass || null,
      segment_analysis: assessment.segmentAnalysis || {},
      systolic_bp: assessment.systolicBP || null,
      diastolic_bp: assessment.diastolicBP || null,
      heart_rate: assessment.heartRate || null,
      blood_glucose: assessment.bloodGlucose || null,
      client_notes: assessment.clientNotes || null,
      professional_notes: assessment.professionalNotes || null,
      photos: assessment.photos || {},
      next_assessment_date: assessment.nextAssessmentDate || null,
      next_assessment_time: assessment.nextAssessmentTime || null,
      group_id: assessment.groupId || null,
    } as never);
    if (error) { toast.error("Erro ao salvar avaliação"); throw error; }
    toast.success("Avaliação salva");
    await loadClients();
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Avaliar Aluno</h1>
        <p className="text-sm text-white/50">Registre bioimpedância, anamnese e evolução</p>
      </div>
      <FitMindShape
        coach={coachInfo}
        clients={clients}
        onCreateClient={createClient}
        onSaveAssessment={saveAssessment}
        onSearchClients={async (query) => clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()))}
        groups={[
          { id: "challenge", name: "Desafio 30 Dias", color: "#dc2626" },
          { id: "premium", name: "Alunos Premium", color: "#991b1b" },
        ]}
        themeColor="#dc2626"
        themeFontFamily="inherit"
      />
    </>
  );
}

function WalletTab() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Carteira</h1>
        <p className="text-sm text-white/50">Suas comissões e saques</p>
      </div>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))" }}>
        <p className="text-xs uppercase tracking-wider text-primary-foreground/80 font-bold">
          Saldo disponível
        </p>
        <p className="text-4xl font-bold text-primary-foreground mt-2">R$ 2.450,00</p>
        <p className="text-xs text-primary-foreground/70 mt-1">+ R$ 654,00 pendente</p>
        <Button
          variant="outline"
          className="mt-4 border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
        >
          <Wallet className="h-4 w-4 mr-2" /> Solicitar saque PIX
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 mb-6">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total ganho</p>
          <p className="text-xl font-bold text-white mt-1">R$ 12.840</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total sacado</p>
          <p className="text-xl font-bold text-white mt-1">R$ 9.736</p>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Histórico recente</h3>
        <div className="space-y-2">
          {[
            { who: "Carlos S. (direto)", value: 98.5, type: "Comissão direta 50%" },
            { who: "Ana L. (nível 1)", value: 29.55, type: "Comissão nível 1 - 15%" },
            { who: "Pedro M. (nível 2)", value: 9.85, type: "Comissão nível 2 - 5%" },
            { who: "Saque PIX", value: -800, type: "Aprovado em 10/04" },
          ].map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ backgroundColor: "#0F0F0F" }}
            >
              <div>
                <p className="text-xs font-medium text-white">{t.who}</p>
                <p className="text-[10px] text-white/40">{t.type}</p>
              </div>
              <span className={`text-sm font-bold ${t.value > 0 ? "text-success" : "text-white/70"}`}>
                {t.value > 0 ? "+" : ""}R$ {Math.abs(t.value).toFixed(2).replace(".", ",")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


function AttendanceTab() {
  const [rows, setRows] = useState<{ id: string; name: string; email: string; attendance: number; last: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = userData.user ? await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle() : { data: null };
      const { data: coach } = profile?.id ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle() : { data: null };
      if (!coach?.id) { setLoading(false); return; }
      const { data: students } = await supabase.from("students").select("id,profiles!students_profile_id_fkey(name,email)").eq("coach_id", coach.id);
      const studentRows = (students as unknown as { id: string; profiles: { name: string; email: string } | null }[]) || [];
      const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const { data: logs } = studentRows.length > 0 ? await supabase.from("attendance_logs").select("student_id,log_date,attended").in("student_id", studentRows.map((student) => student.id)).gte("log_date", since) : { data: [] };
      const logRows = (logs as unknown as { student_id: string; log_date: string; attended: boolean | null }[]) || [];
      setRows(studentRows.map((student) => {
        const ownLogs = logRows.filter((log) => log.student_id === student.id && log.attended);
        return {
          id: student.id,
          name: student.profiles?.name || "Aluno",
          email: student.profiles?.email || "",
          attendance: Math.round((new Set(ownLogs.map((log) => log.log_date)).size / 30) * 100),
          last: ownLogs.sort((a, b) => b.log_date.localeCompare(a.log_date))[0]?.log_date || "—",
        };
      }));
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Frequência dos Alunos</h1>
        <p className="text-sm text-white/50">Check-ins reais dos últimos 30 dias</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando frequência...</p> : rows.length === 0 ? <p className="text-sm text-white/50">Nenhum aluno encontrado.</p> : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{row.name}</p><p className="truncate text-[10px] text-white/40">{row.email}</p></div>
                  <span className="text-sm font-bold text-primary">{row.attendance}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.attendance)}%` }} /></div>
                <p className="mt-1 text-[10px] text-white/40">Último check-in: {row.last === "—" ? "—" : new Date(row.last).toLocaleDateString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CareerTab() {
  const allPatents: { p: import("@/components/coach/PatentBadge").PatentLevel; req: string; current?: boolean; achieved?: boolean }[] = [
    { p: "coach", req: "Cadastro aprovado", achieved: true },
    { p: "senior_coach", req: "10+ alunos diretos", current: true, achieved: true },
    { p: "manager", req: "30+ alunos + 3 coaches" },
    { p: "senior_manager", req: "60+ alunos + 5 managers" },
    { p: "director", req: "100+ alunos + 10 managers" },
    { p: "senior_director", req: "200+ alunos + 3 directors" },
    { p: "master_director", req: "500+ alunos + 5 directors" },
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Plano de Carreira</h1>
        <p className="text-sm text-white/50">Sua jornada na FitMind Club</p>
      </div>

      <CareerProgress currentMonths={3} currentStudents={24} isTopSeller={false} />

      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-4">Sistema de Patentes</h3>
        <div className="space-y-2">
          {allPatents.map((item) => (
            <div
              key={item.p}
              className={`flex items-center gap-3 rounded-xl p-3 ${
                item.current ? "ring-1 ring-primary/40" : ""
              }`}
              style={{ backgroundColor: item.current ? "rgba(255,66,48,0.06)" : "#0F0F0F" }}
            >
              <PatentBadge patent={item.p} size="md" showName={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <PatentBadge patent={item.p} size="sm" showName={true} />
                  {item.current && (
                    <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">
                      ATUAL
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">{item.req}</p>
              </div>
              {item.achieved && (
                <span className="text-[10px] font-bold text-success">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
