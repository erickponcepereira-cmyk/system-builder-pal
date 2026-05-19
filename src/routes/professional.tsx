import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { LogOut, Loader2, Users, Wallet, Network, AlertCircle, Utensils, Dumbbell, Stethoscope, Sparkles, ClipboardList, FileText, Calendar, HeartPulse, Package, Settings } from "lucide-react";
import ProfessionalProductsPanel from "@/components/professional/ProfessionalProductsPanel";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { MyNetworkPanel } from "@/components/MyNetworkPanel";
import { ProfessionalStudentsTab } from "@/components/professional/ProfessionalStudentsTab";
import { AnamneseTab } from "@/components/professional/AnamneseTab";
import { SettingsTab } from "@/components/professional/SettingsTab";
import { ProtocolTab } from "@/components/coach/tabs/ProtocolTab";
import { EvaluateTab } from "@/components/coach/tabs/EvaluateTab";
import { NetworkTreeTab } from "@/components/coach/tabs/NetworkTreeTab";
import type { CoachContext } from "@/routes/coach";

export const Route = createFileRoute("/professional")({
  head: () => ({ meta: [{ title: "Painel Profissional — FitMind Club" }] }),
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
  wallet: { label: "Carteira", icon: Wallet },
  network: { label: "Rede", icon: Network },
  settings: { label: "Configurações", icon: Settings },
};

function ProfessionalPanel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ProInfo | null>(null);
  const [tab, setTab] = useState<string>("students");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/login" }); return; }

      const { data: profile } = await supabase
        .from("profiles").select("id,name,avatar_url,status").eq("user_id", user.id).maybeSingle();
      if (!profile) { navigate({ to: "/login" }); return; }

      const { data: coachRow } = await supabase
        .from("coaches")
        .select("id,is_professional,specialty_key,serves_whole_network,specialty_pending_setup,approved_at")
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
      };

      setInfo(proInfo);
      if (spec?.default_tabs?.length) setTab(spec.default_tabs[0]);
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
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="max-w-md text-center rounded-2xl p-8" style={{ backgroundColor: "#1A1A1A" }}>
          <AlertCircle className="mx-auto h-10 w-10 text-amber-400 mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Aguardando aprovação</h2>
          <p className="text-sm text-white/60 mb-6">Seu cadastro como profissional está em análise. Você receberá uma notificação assim que o admin liberar seu acesso.</p>
          <button onClick={handleLogout} className="text-sm text-primary hover:underline">Sair</button>
        </div>
      </div>
    );
  }

  const baseTabs = info.specialty?.default_tabs ?? ["students", "diet", "anamnese", "evaluate", "network"];
  const ensureTabs = ["students", "diet", "anamnese", "evaluate", "network", "products", "settings"];
  const tabs = Array.from(new Set([...baseTabs, ...ensureTabs]));

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      <header className="border-b border-white/5" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 object-contain" />
            <div>
              <span className="text-sm font-bold text-white">FitMind Club</span>
              <p className="text-[10px] text-primary uppercase tracking-wider">Profissional · {info.specialty?.label || "—"}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <RoleSwitcher current="professional" />
            <button onClick={handleLogout} className="rounded-lg border border-white/10 p-2 text-white/50 hover:bg-white/5">
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

        {/* Tabs nav */}
        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const meta = TAB_META[t] ?? { label: t, icon: Users };
            const Icon = meta.icon;
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${active ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </button>
            );
          })}
        </div>

        <TabContent tab={tab} info={info} assignments={assignments} />
      </div>
    </div>
  );
}

function TabContent({ tab, info, assignments }: { tab: string; info: ProInfo; assignments: AssignmentRow[] }) {
  if (tab === "products") return <ProfessionalProductsPanel coachId={info.coachId} />;
  if (tab === "wallet") return <MyNetworkPanel />;
  if (tab === "settings") return <SettingsTab coachId={info.coachId} profileId={info.profileId} />;
  if (["students", "clients"].includes(tab)) return <ProfessionalStudentsTab coachId={info.coachId} />;
  if (tab === "diet") return <ProtocolTab />;
  if (tab === "anamnese") return <AnamneseTab coachId={info.coachId} />;
  if (tab === "evaluate") return <EvaluateTab />;
  if (tab === "network") {
    const coachCtx: CoachContext = {
      profileId: info.profileId,
      coachId: info.coachId,
      name: info.name,
      email: "",
      phone: "",
      city: "",
      state: "",
      bio: "",
      avatarUrl: info.avatarUrl,
      patent: null,
      referralCode: "",
      referralLink: "",
      uplineCoachId: null,
      totalActiveStudents: 0,
      totalSales: 0,
    };
    return <NetworkTreeTab coach={coachCtx} />;
  }

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

