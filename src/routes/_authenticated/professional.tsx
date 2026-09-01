import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { SellerReviewsPanel } from "@/components/store/SellerReviewsPanel";
import { LogOut, Loader2, Users, Wallet, AlertCircle, Utensils, Dumbbell, Stethoscope, Sparkles, ClipboardList, FileText, Calendar, CalendarDays, HeartPulse, Package, Settings, ShoppingBag, LayoutDashboard, Share2, KanbanSquare, BookOpen, Star } from "lucide-react";
import { CollabWorkspace } from "@/components/shared/CollabWorkspace";
import { useServerFn } from "@tanstack/react-start";
import { getCollabPendingCounts } from "@/lib/collab.functions";
import { OverviewTab } from "@/components/professional/OverviewTab";
import { StorePage } from "@/components/student/StorePage";

import ProfessionalProductsPanel from "@/components/professional/ProfessionalProductsPanel";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useBranding } from "@/components/theme-provider";
import { ProfessionalWalletTab } from "@/components/professional/ProfessionalWalletTab";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { SubscriptionGuard } from "@/components/profile/SubscriptionGuard";
import { ProfessionalOnboardingGate } from "@/components/professional/ProfessionalOnboardingGate";

import { ProfessionalStudentsTab } from "@/components/professional/ProfessionalStudentsTab";
import { ProfessionalCollaboratorsPanel } from "@/components/professional/ProfessionalCollaboratorsPanel";
import { AnamneseTab } from "@/components/professional/AnamneseTab";
import { SettingsTab } from "@/components/professional/SettingsTab";
import { ProtocolTab } from "@/components/coach/tabs/ProtocolTab";
import { EvaluateTab } from "@/components/coach/tabs/EvaluateTab";

import { FitmindCalendar } from "@/components/FitmindCalendar";

import { AppointmentsTab } from "@/components/professional/AppointmentsTab";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { WhatsappGroupSettings } from "@/components/shared/WhatsappGroupSettings";
import { MessageCircle } from "lucide-react";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { RunChallengesPanel } from "@/components/professional/RunChallengesPanel";
import { Footprints } from "lucide-react";
import { meusQuadrosCrm } from "@/lib/admin-crm.functions";



export const Route = createFileRoute("/_authenticated/professional")({
  head: () => ({ meta: [{ title: "Painel Profissional — FitMind Club" }] }),
  // Sessão é garantida pelo layout pai _authenticated (ssr:false, client-side).
  component: ProfessionalPanel,
});

type ProInfo = {
  profileId: string;
  coachId: string;
  name: string;
  avatarUrl: string | null;
  specialtyKey: string | null;
  specialty: { key: string; label: string; default_tabs: string[]; requires_admin_setup: boolean; capabilities: Record<string, boolean> } | null;
  servesWholeNetwork: boolean;
  pendingSetup: boolean;
  approved: boolean;
  referralCode: string | null;
};

type AssignmentRow = {
  id: string;
  transaction_id: string;
  status: string;
  delivered_at: string | null;
  specialty_key: string;
  assignment_reason: string;
  transactions: {
    id: string;
    gross_amount: number;
    paid_at: string | null;
    student_id: string;
    students: { profiles: { name: string; email: string; phone: string | null; avatar_url: string | null } | null } | null;
    products: { name: string } | null;
  } | null;
};

const TAB_META: Record<string, { label: string; icon: typeof Users }> = {
  students: { label: "Meus Alunos", icon: Users },
  avaliacoes: { label: "Avaliações", icon: Star },
  clients: { label: "Meus Clientes", icon: Users },
  diet: { label: "Dieta / Protocolo", icon: Utensils },
  anamnese: { label: "Anamnese", icon: ClipboardList },
  workout: { label: "Treinos", icon: Dumbbell },
  evaluate: { label: "Avaliações", icon: ClipboardList },
  prescriptions: { label: "Prescrições", icon: FileText },
  exams: { label: "Exames", icon: Stethoscope },
  cardio_reports: { label: "Laudos Cardio", icon: HeartPulse },
  aesthetic_protocol: { label: "Protocolo Estético", icon: Sparkles },
  sessions: { label: "Sessões", icon: Calendar },
  legal_docs: { label: "Documentos", icon: FileText },
  consultations: { label: "Consultas", icon: Calendar },
  products: { label: "Produtos", icon: Package },
  store: { label: "Loja", icon: ShoppingBag },
  wallet: { label: "Carteira", icon: Wallet },
  overview: { label: "Visão Geral", icon: LayoutDashboard },
  settings: { label: "Configurações", icon: Settings },
  fitmind_calendar: { label: "Agenda FitMind", icon: CalendarDays },
  appointments: { label: "Atendimentos", icon: Calendar },
  subscription: { label: "Mensalidade", icon: Wallet },
  collab: { label: "Colaboração", icon: Share2 },
  collaborators: { label: "Colaboradores", icon: Users },
  crm: { label: "CRM", icon: KanbanSquare },
  run_challenges: { label: "Desafios de Corrida", icon: Footprints },
  wa_group: { label: "Meu grupo WhatsApp", icon: MessageCircle },
};

function ProfessionalPanel() {
  const navigate = useNavigate();
  const { theme: brandTheme } = useBranding();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ProInfo | null>(null);
  const [tab, setTab] = useState<string>("students");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [collabPending, setCollabPending] = useState(0);
  const [crmQuadroId, setCrmQuadroId] = useState<string | null>(null);
  const getCollabCounts = useServerFn(getCollabPendingCounts);
  const buscarQuadroCrm = useServerFn(meusQuadrosCrm);

  useEffect(() => {
    if (!info?.coachId) return;
    let alive = true;
    const load = () => getCollabCounts({ data: { entityType: "professional", entityId: info.coachId } })
      .then((r) => { if (alive) setCollabPending(r.total); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [info?.coachId]);

  useEffect(() => {
    if (!info?.profileId) return;
    let alive = true;
    buscarQuadroCrm({ data: { escopo: "profissional", ownerId: info.profileId } })
      .then((r) => { if (alive) setCrmQuadroId(r.quadros[0]?.id ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [info?.profileId]);



  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" }); return;
      }

      const { data: profile } = await supabase
        .from("profiles").select("id,name,avatar_url,status").eq("user_id", user.id).maybeSingle();
      if (!profile) {
        navigate({ to: "/login" }); return;
      }

      const { data: coachRow } = await supabase
        .from("coaches")
        .select("id,is_professional,specialty_key,serves_whole_network,specialty_pending_setup,approved_at,referral_code")
        .eq("profile_id", profile.id).maybeSingle();

      if (!coachRow || !coachRow.is_professional) {
        toast.error("Acesso restrito a profissionais.");
        navigate({ to: "/coach" });
        return;
      }

      let spec: ProInfo["specialty"] = null;
      if (coachRow.specialty_key) {
        const { data: s } = await supabase.from("professional_specialties")
          .select("key,label,default_tabs,requires_admin_setup,capabilities")
          .eq("key", coachRow.specialty_key).maybeSingle();
        if (s) spec = { ...s, default_tabs: (s.default_tabs as string[]) || [], capabilities: (s.capabilities as Record<string, boolean>) || {} };
      }

      const proInfo: ProInfo = {
        profileId: profile.id,
        coachId: coachRow.id,
        name: profile.name || "Profissional",
        avatarUrl: profile.avatar_url,
        specialtyKey: coachRow.specialty_key,
        specialty: spec,
        servesWholeNetwork: !!coachRow.serves_whole_network,
        pendingSetup: !!coachRow.specialty_pending_setup,
        approved: !!coachRow.approved_at,
        referralCode: (coachRow as { referral_code: string | null }).referral_code ?? null,
      };

      setInfo(proInfo);
      setTab("overview");
      setLoading(false);

      // Load assignments
      const { data: asgn } = await supabase
        .from("transaction_professional_assignments")
        .select("id,transaction_id,status,delivered_at,specialty_key,assignment_reason,transactions(id,gross_amount,paid_at,student_id,students(profiles(name,email,phone,avatar_url)),products(name))")
        .eq("assigned_coach_id", coachRow.id)
        .order("created_at", { ascending: false }).limit(100);
      setAssignments((asgn as unknown as AssignmentRow[]) || []);
    })();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (loading || !info) {
    return <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!info.approved) {
    return <ProfessionalOnboardingGate>{null}</ProfessionalOnboardingGate>;
  }


  const baseTabs = info.specialty?.default_tabs ?? ["students", "diet", "anamnese", "evaluate"];
  const ensureTabs = ["overview", "students", "diet", "anamnese", "evaluate", "products", "avaliacoes", "store", "appointments", "collaborators", "collab", "run_challenges", "wa_group", "settings", "fitmind_calendar"];
  const tabs = ["overview", ...Array.from(new Set([...baseTabs, ...ensureTabs, "subscription", ...(crmQuadroId ? ["crm"] : [])])).filter((t) => t !== "network" && t !== "overview")];


  return (
    <SubscriptionGuard walletSource="professional">
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      <header
        className="border-b"
        style={{
          backgroundColor: "var(--sidebar)",
          color: "var(--sidebar-foreground)",
          borderBottomColor: "var(--sidebar-border)",
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 object-contain" />
            <div>
              <span className="text-sm font-bold text-current">{brandTheme.name}</span>
              <p className="text-[10px] text-primary uppercase tracking-wider">Profissional · {info.specialty?.label || "—"}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <RoleSwitcher current="professional" />
            <button onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded-lg border text-current opacity-70 hover:opacity-100 touch-manipulation" style={{ borderColor: "var(--sidebar-border)" }}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {info.pendingSetup && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>O admin foi notificado para configurar abas personalizadas para sua área. Enquanto isso você tem acesso às abas básicas.</p>
          </div>
        )}

        <div className="mb-4"><WhatsAppGroupCard /></div>

        <Link
          to="/professional/orders-in-progress"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-bold text-white">Compras em andamento</p>
              <p className="text-[11px] text-white/60">Acompanhe pedidos físicos, endereço e prazo de entrega</p>
            </div>
          </div>
          <span className="text-xs text-primary font-medium">Abrir →</span>
        </Link>

        <Link
          to="/professional/cursos"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 hover:bg-sky-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-sky-300" />
            <div>
              <p className="text-sm font-bold text-white">Cursos</p>
              <p className="text-[11px] text-white/60">Crie o curso, monte as aulas e envie para aprovação</p>
            </div>
          </div>
          <span className="text-xs text-sky-300 font-medium">Abrir →</span>
        </Link>

        <Link
          to="/professional/herbalife-boletos"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-emerald-300" />
            <div>
              <p className="text-sm font-bold text-white">Boletos Herbalife</p>
              <p className="text-[11px] text-white/60">Anexe o boleto de cada venda para a Fitmind pagar</p>
            </div>
          </div>
          <span className="text-xs text-emerald-300 font-medium">Abrir →</span>
        </Link>



        {/* Tabs nav */}
        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const meta = TAB_META[t] ?? { label: t, icon: Users };
            const Icon = meta.icon;
            const active = tab === t;
            const badge = t === "collab" ? collabPending : 0;
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${active ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                <Icon className="h-3.5 w-3.5" /> {meta.label}
                {badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{badge}</span>
                )}
              </button>
            );
          })}
        </div>

        <TabContent tab={tab} info={info} assignments={assignments} crmQuadroId={crmQuadroId} />

      </div>
    </div>
    </SubscriptionGuard>
  );
}

function TabContent({ tab, info, assignments, crmQuadroId }: { tab: string; info: ProInfo; assignments: AssignmentRow[]; crmQuadroId: string | null }) {
  if (tab === "crm" && crmQuadroId) return <CrmBoard quadroId={crmQuadroId} />;
  if (tab === "overview") return <OverviewTab coachId={info.coachId} profileId={info.profileId} coachName={info.name} />;
  if (tab === "products") return <ProfessionalProductsPanel coachId={info.coachId} />;
  if (tab === "avaliacoes") return <SellerReviewsPanel />;
  if (tab === "wallet") return <ProfessionalWalletTab />;
  if (tab === "subscription") return <SubscriptionInvoicesTab walletSource="professional" />;
  if (tab === "store") return <StorePage coachMode audience="professional" />;
  if (tab === "settings") return <SettingsTab coachId={info.coachId} profileId={info.profileId} />;
  if (tab === "fitmind_calendar") return <FitmindCalendar />;
  if (tab === "collab") return <CollabWorkspace ownerType="professional" ownerId={info.coachId} />;
  if (tab === "collaborators") return <ProfessionalCollaboratorsPanel referralCode={info.referralCode} professionalName={info.name} />;

  if (tab === "wa_group") return <WhatsappGroupSettings ownerKind="professional" ownerId={info.coachId} ownerName={info.name} />;
  if (tab === "run_challenges") return <RunChallengesPanel />;
  if (tab === "appointments") return <AppointmentsTab coachId={info.coachId} />;

  if (["students", "clients"].includes(tab)) return <ProfessionalStudentsTab coachId={info.coachId} />;
  if (tab === "diet") return <ProtocolTab />;
  if (tab === "anamnese") return <AnamneseTab coachId={info.coachId} />;
  if (tab === "evaluate") return <EvaluateTab />;

  // Fallback: also show assignments for any other specialty tab
  return <AssignmentsList info={info} assignments={assignments} />;
}

function AssignmentsList({ info, assignments }: { info: ProInfo; assignments: AssignmentRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-white">Alunos atribuídos por venda</h2>
        <span className="text-xs text-white/40">{assignments.length} registros</span>
      </div>
      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Users className="mx-auto h-8 w-8 text-white/30 mb-2" />
          <p className="text-sm text-white/50">Nenhum aluno atribuído ainda.</p>
          <p className="text-xs text-white/30 mt-1">Quando vendas exigirem sua especialidade ({info.specialty?.label}), os alunos aparecerão aqui.</p>
        </div>
      ) : (
        assignments.map((a) => {
          const stProfile = a.transactions?.students?.profiles;
          return (
            <div key={a.id} className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-sm font-bold">
                {(stProfile?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{stProfile?.name || "Aluno"}</p>
                <p className="text-[11px] text-white/40 truncate">{a.transactions?.products?.name || "Produto"} · {a.assignment_reason}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${a.status === "pending" ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}`}>
                {a.status === "pending" ? "Pendente" : "Entregue"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

