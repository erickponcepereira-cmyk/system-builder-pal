import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users, Wallet, BarChart3, User, LogOut,
  Menu, X, Trophy, ClipboardList, CalendarCheck, CalendarDays,
  ShoppingBag, Gift, Network, UserRound, Repeat, Award, Utensils, ClipboardCheck, Dumbbell,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentBadge } from "@/components/coach/PatentBadge";
import { CoachReports } from "@/components/coach/CoachReports";
import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { OverviewTab } from "@/components/coach/tabs/OverviewTab";
import { NetworkTab } from "@/components/coach/tabs/NetworkTab";
import { CoachProfileTab } from "@/components/coach/tabs/CoachProfileTab";
import { CoachStudentsTab } from "@/components/coach/tabs/CoachStudentsTab";
import { NetworkTreeTab } from "@/components/coach/tabs/NetworkTreeTab";
import { NetworkRankingTab } from "@/components/coach/tabs/NetworkRankingTab";
import { PhysicalStoreTab } from "@/components/coach/tabs/StoreTab";
import { CoachBenefitsTab } from "@/components/coach/tabs/BenefitsTab";
import { EvaluateTab } from "@/components/coach/tabs/EvaluateTab";
import { WalletTab } from "@/components/coach/tabs/WalletTab";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { AttendanceTab } from "@/components/coach/tabs/AttendanceTab";
import { CareerTab } from "@/components/coach/tabs/CareerTab";
import { ProtocolTab } from "@/components/coach/tabs/ProtocolTab";

import { PartnersApprovalTab } from "@/components/coach/tabs/PartnersApprovalTab";
import { FitmindCalendar } from "@/components/FitmindCalendar";
import { ChallengeTab } from "@/components/coach/tabs/ChallengeTab";
import { useServerFn } from "@tanstack/react-start";
import { getMyBadges } from "@/lib/coach-badges.functions";
import { getIndividualCareer } from "@/lib/coach-medals.functions";
import { getCareerProgress } from "@/lib/coach-career.functions";
import { CoachOnboardingGate } from "@/components/coach/CoachOnboardingGate";



// Link "/" usage to satisfy unused import warnings (not required)
void Link;

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Painel Coach — FitMind Club" },
      { name: "description", content: "Gerencie sua rede, vendas e comissões." },
    ],
  }),
  component: CoachDashboard,
});
type Tab = "overview" | "network" | "networkRanking" | "profile" | "students" | "tree" | "physicalStore" | "benefits" | "evaluate" | "protocol" | "workouts" | "attendance" | "wallet" | "subscription" | "career" | "reports" | "partnerApprovals" | "fitmind_calendar" | "challenge";


export const money = (value: number | null | undefined) =>
  `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CoachContext {
  profileId: string;
  coachId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  bio: string;
  avatarUrl: string | null;
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
      ? await supabase.from("profiles").select("id,name,email,phone,city,state,bio,patent,avatar_url").eq("user_id", userData.user.id).maybeSingle()
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
      avatarUrl: (profile as any).avatar_url || null,
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
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (t) return t;
    }
    return "overview";
  });
  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (t) setActiveTab(t);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [coachName, setCoachName] = useState("Coach");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [hasStudentProfile, setHasStudentProfile] = useState(false);
  const [hasPartnerProfile, setHasPartnerProfile] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachRowId, setCoachRowId] = useState<string | null>(null);
  const [profileIdState, setProfileIdState] = useState<string | null>(null);
  const { coach: coachContext, loading: coachContextLoading, reload: reloadCoach, setCoach: setCoachContext } = useCoachContext();
  const referralCode = coachContext?.referralCode || "FITMIND";
  const referralLink = (() => {
    // Sempre gerar um link absoluto para a URL publicada da página, levando direto
    // para o cadastro com o coach indicador já preenchido (via /r/:code).
    const path = `/r/${referralCode}`;
    if (typeof window !== "undefined") return `${window.location.origin}${path}`;
    return `https://fitmindclub.lovable.app${path}`;
  })();

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
        ? await supabase.from("coaches").select("id, approved_at").eq("profile_id", profile.id).maybeSingle()
        : { data: null };

      const { data: studentRow } = profile
        ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
        : { data: null };

      const { data: partnerRow } = profile
        ? await supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle()
        : { data: null };

      if (!active) return;
      setIsAdmin(profile?.role === "admin");
      const coachApproved = !!coach && !!coach.approved_at;
      const isPrivilegedRole = ["admin", "manager", "director"].includes(profile?.role || "");

      if (!coach && !isPrivilegedRole) {
        navigate({ to: "/student", replace: true });
        return;
      }

      setIsPending(!coachApproved && !isPrivilegedRole);
      setHasStudentProfile(!!studentRow);
      setHasPartnerProfile(!!partnerRow);
      setCoachRowId(coach?.id || null);
      setProfileIdState(profile?.id || null);
      if (profile?.name) setCoachName(profile.name.split(" ")[0]);
      setCheckingAccess(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  // Realtime: detecta aprovação do coach
  useEffect(() => {
    if (!coachRowId || !isPending) return;
    const channel = supabase
      .channel(`coach-approval-${coachRowId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "coaches", filter: `id=eq.${coachRowId}` },
        (payload) => {
          const newRow: any = payload.new;
          if (newRow?.approved_at) {
            setIsPending(false);
            toast.success("🎉 Cadastro de coach aprovado! Acesso liberado.");
            reloadCoach();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [coachRowId, isPending, reloadCoach]);

  // Realtime: notificações
  useEffect(() => {
    if (!profileIdState) return;
    const channel = supabase
      .channel(`notif-${profileIdState}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${profileIdState}` },
        (payload) => {
          const n: any = payload.new;
          toast.success(n?.title || "Nova notificação", { description: n?.message || undefined });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profileIdState]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  // Categoria "Mestre de Parcerias" libera a aba de aprovar parceiros
  const fetchMyBadges = useServerFn(getMyBadges);
  const [canApprovePartners, setCanApprovePartners] = useState(false);
  useEffect(() => {
    if (isAdmin) { setCanApprovePartners(true); return; }
    fetchMyBadges()
      .then((b) => setCanApprovePartners((b as string[]).includes("partnership_master")))
      .catch(() => setCanApprovePartners(false));
  }, [isAdmin, coachRowId]);

  // Patente atual (Ordem dos Construtores) + última medalha individual
  const fetchCareer = useServerFn(getIndividualCareer);
  const fetchProgress = useServerFn(getCareerProgress);
  const [latestMedal, setLatestMedal] = useState<{ name: string; key: string } | null>(null);
  const [teamPatent, setTeamPatent] = useState<{ name: string; color: string } | null>(null);
  useEffect(() => {
    if (!coachRowId) return;
    fetchCareer()
      .then((c) => {
        const e = c.earned?.[0];
        if (!e) { setLatestMedal(null); return; }
        const rule = [...c.monthlyRules, ...c.cumulativeRules].find((r) => r.key === e.medal_key);
        setLatestMedal({ name: rule?.display_name || e.medal_key, key: e.medal_key });
      })
      .catch(() => setLatestMedal(null));
    fetchProgress()
      .then((p) => {
        const cur = p.patents.find((x) => x.key === p.currentPatentKey);
        if (cur) setTeamPatent({ name: cur.display_name, color: cur.badge_color || "#FF4230" });
        else setTeamPatent(null);
      })
      .catch(() => setTeamPatent(null));
  }, [coachRowId]);

  const navItems: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: "Visão Geral", icon: BarChart3 },
    { id: "network", label: "Minha Rede", icon: Users },
    { id: "tree", label: "Árvore da Rede", icon: Network },
    { id: "networkRanking", label: "Ranking da Rede", icon: Trophy },
    { id: "students", label: "Base de Alunos", icon: UserRound },
    { id: "physicalStore", label: "Loja", icon: ShoppingBag },
    ...(canApprovePartners ? [{ id: "partnerApprovals" as Tab, label: "Aprovar Parceiros", icon: ClipboardCheck }] : []),
    { id: "benefits", label: "Gratuitos", icon: Gift },
    { id: "evaluate", label: "Avaliar Aluno", icon: ClipboardList },
    { id: "protocol", label: "Protocolo & Treino", icon: Utensils },
    
    { id: "attendance", label: "Frequência", icon: CalendarCheck },
    { id: "reports", label: "Relatórios", icon: BarChart3 },
    { id: "fitmind_calendar", label: "Agenda FitMind", icon: CalendarDays },
    { id: "challenge", label: "Desafio", icon: Trophy },

    { id: "wallet", label: "Carteira", icon: Wallet },
    { id: "subscription", label: "Mensalidade", icon: Wallet },
    { id: "career", label: "Carreira", icon: Trophy },
    { id: "profile", label: "Meu Perfil", icon: User },
  ];

  if (checkingAccess || coachContextLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <CoachOnboardingGate>
    <SubscriptionGuard walletSource="coach">
    <div className="flex min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>

      {/* Mobile header */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-white/5 px-4 backdrop-blur-xl lg:hidden"
        style={{ backgroundColor: "rgba(10,10,10,0.9)" }}
      >
        <div className="flex items-center gap-2">
<Logo className="h-9 w-auto object-contain" />
          <span className="font-bold text-white">FitMind Club</span>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher current="coach" />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto overscroll-contain transform border-r border-white/5 p-4 transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="mb-8 flex items-center gap-2 px-2 pt-14 lg:pt-0">
<Logo className="h-9 w-auto object-contain" />
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
              {teamPatent ? (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
                  style={{ backgroundColor: `${teamPatent.color}20`, border: `1px solid ${teamPatent.color}55` }}>
                  <Trophy className="h-3 w-3" style={{ color: teamPatent.color }} />
                  <span className="text-[10px] font-bold truncate" style={{ color: teamPatent.color }}>{teamPatent.name}</span>
                </div>
              ) : (
                (() => {
                  const validPatents = ["coach","senior_coach","manager","senior_manager","director","senior_director","master_director"] as const;
                  const p = (coachContext?.patent || "coach") as typeof validPatents[number];
                  const safe = validPatents.includes(p) ? p : "coach";
                  return <PatentBadge patent={safe} size="sm" />;
                })()
              )}
              {latestMedal && (
                <p className="mt-1 text-[10px] font-bold text-amber-400 truncate">🏅 {latestMedal.name}</p>
              )}
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

        {isAdmin && (
          <button
            onClick={() => navigate({ to: "/admin" })}
            className="mt-auto flex items-center gap-3 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Repeat className="h-4 w-4" />
            Modo admin
          </button>
        )}
        {hasStudentProfile && (
          <button
            onClick={() => {
              sessionStorage.setItem("fitmind_selected_area", "student");
              navigate({ to: "/student" });
            }}
            className={`${isAdmin ? "mt-2" : "mt-auto"} flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors`}
          >
            <Repeat className="h-4 w-4" />
            Ir para painel do aluno
          </button>
        )}

        {hasPartnerProfile ? (
          <button
            onClick={() => navigate({ to: "/partner" })}
            className="mt-2 flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <Repeat className="h-4 w-4" />
            Painel de Parceiro
          </button>
        ) : (
          <button
            onClick={() => navigate({ to: "/become-partner" })}
            className="mt-2 flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
          >
            <Repeat className="h-4 w-4" />
            Tornar-se Empresa Parceira
          </button>
        )}


        <button
          onClick={handleLogout}
          className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/40 hover:text-white transition-colors"
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
          {isPending && (
            <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Award className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white">Aguardando autorização do admin</h3>
                  <p className="mt-1 text-xs text-white/70">
                    Seu cadastro de coach está em análise. Explore o seu perfil de aluno enquanto aguarda — você será notificado assim que for autorizado.
                  </p>
                  {hasStudentProfile && (
                    <button
                      onClick={() => {
                        sessionStorage.setItem("fitmind_selected_area", "student");
                        navigate({ to: "/student" });
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <Repeat className="h-3.5 w-3.5" />
                      Mudar para painel de aluno
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className={isPending ? "pointer-events-none select-none opacity-50" : ""} aria-disabled={isPending}>
          {activeTab === "overview" && (
            <OverviewTab coachName={coachName} referralLink={referralLink} onCopy={copyReferral} coachId={coachContext?.coachId || ""} />
          )}
          {activeTab === "network" && <NetworkTab referralLink={referralLink} onCopy={copyReferral} />}
          {activeTab === "profile" && <CoachProfileTab coach={coachContext} onSaved={reloadCoach} onLocalChange={setCoachContext} />}
          {activeTab === "students" && <CoachStudentsTab coachId={coachContext?.coachId || ""} />}
          {activeTab === "tree" && <NetworkTreeTab coach={coachContext} />}
          {activeTab === "networkRanking" && <NetworkRankingTab />}
          {activeTab === "physicalStore" && <PhysicalStoreTab hasUpline={!!coachContext?.uplineCoachId} />}
          {activeTab === "partnerApprovals" && canApprovePartners && <PartnersApprovalTab />}
          {activeTab === "benefits" && <CoachBenefitsTab />}
          {activeTab === "evaluate" && <EvaluateTab />}
          {activeTab === "protocol" && <ProtocolTab />}
          
          {activeTab === "attendance" && <AttendanceTab />}
          {activeTab === "reports" && <CoachReports />}
         {activeTab === "fitmind_calendar" && <div className="p-4"><FitmindCalendar /></div>}
         {activeTab === "challenge" && <div className="p-4"><ChallengeTab coachId={coachContext?.coachId} /></div>}

          {activeTab === "career" && <CareerTab />}
         {activeTab === "wallet" && <WalletTab />}
         {activeTab === "subscription" && <SubscriptionInvoicesTab walletSource="coach" />}
          </div>
        </div>
      </main>
    </div>
    </SubscriptionGuard>
    </CoachOnboardingGate>
  );
}

