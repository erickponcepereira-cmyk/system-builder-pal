import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, Users, HelpCircle, LogOut, ChevronRight, Camera, GraduationCap, ClipboardList, Wallet, Clock, CheckCircle2, XCircle, QrCode, Building2, Activity, Coins, Trophy, Briefcase, X, Gift, Heart, Star, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getMyChallengeTokenHistory, type ChallengeTokenHistoryEntry } from "@/lib/challenge-tokens.functions";
import { getMyReferralCommissions } from "@/lib/student-referrals.functions";
import { StudentReferralModal } from "@/components/student/StudentReferralModal";
import { PendingInfo } from "@/components/PendingInfo";
import fitcoinAsset from "@/assets/fitcoin.png.asset.json";

export const Route = createFileRoute("/_authenticated/student/profile")({
  component: ProfilePage,
});

type Enrollment = {
  id: string;
  competition_id: string;
  initial_date: string | null;
  final_date: string | null;
  initial_weight: number | null;
  final_weight: number | null;
  result_kg: number | null;
  result_pct: number | null;
  status: string;
  enrolled_at: string;
  competitions: { month: number; year: number; status: string } | null;
};

const sections = [
  {
    title: "Conta",
    items: [
      { icon: QrCode, label: "Minha Carteirinha", to: "/student/card" },
      { icon: Settings, label: "Editar perfil", to: "/student/profile/edit" },
      { icon: Activity, label: "Minhas avaliações", to: "/student/assessments" },
      { icon: ClipboardList, label: "Meu Protocolo", to: "/student/protocol" },
      { icon: Heart, label: "Ficha médica", to: "/student/medical-record" },
      { icon: ClipboardList, label: "Preencher anamnese", to: "/student/health" },
      
      
    ],
  },
  {
    title: "Negócios",
    items: [
      { icon: GraduationCap, label: "Quero ser Coach", to: "/student/coach-course" },
      { icon: Briefcase, label: "Quero ser Profissional", to: "/student/professional-track" },
      { icon: Building2, label: "Quero ser Empresa Parceira", to: "/student/partner-track" },
    ],
  },
  {
    title: "Suporte",
    items: [
      { icon: HelpCircle, label: "Central de ajuda", to: "/student/support" },
    ],
  },
] as const;

function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState({ name: "Aluno FitMind Club", email: "aluno@email.com", photo_url: "" as string, blood_type: "" as string });
  const [isInfluencer, setIsInfluencer] = useState(false);
  const [isSubcoach, setIsSubcoach] = useState(false);
  const [bioWeightDiff, setBioWeightDiff] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [wallet, setWallet] = useState({ available_balance: 0, pending_balance: 0, total_earned: 0, fitcoin_balance: 0 });
  const [referralLink, setReferralLink] = useState("/r/ALUNO2026");
  const [referralCode, setReferralCode] = useState("ALUNO2026");
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("50");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [holderName, setHolderName] = useState("");
  const [holderCpf, setHolderCpf] = useState("");
  const [referrals, setReferrals] = useState<Array<{ id: string; created_at: string | null; profiles: { name: string; email: string } | null }>>([]);
  const [withdrawals, setWithdrawals] = useState<Array<{ id: string; amount: number; status: string | null; requested_at: string | null; paid_at: string | null }>>([]);
  const [challengeTokens, setChallengeTokens] = useState(0);
  const [tokenHistory, setTokenHistory] = useState<ChallengeTokenHistoryEntry[]>([]);
  const [showTokenHistory, setShowTokenHistory] = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [showChallengesModal, setShowChallengesModal] = useState(false);
  const [showReferralsModal, setShowReferralsModal] = useState(false);
  const [referralCommissions, setReferralCommissions] = useState<Array<{
    id: string;
    amount: number;
    status: string | null;
    available_at: string | null;
    created_at: string;
    buyer_name: string | null;
    product_label: string | null;
    purchase_type: string | null;
    gross_amount: number | null;
  }>>([]);
  const fetchTokenHistory = useServerFn(getMyChallengeTokenHistory);
  const fetchReferralCommissions = useServerFn(getMyReferralCommissions);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profileData } = await supabase.from("profiles").select("id,name,email,photo_url,blood_type").eq("user_id", userData.user.id).maybeSingle();
      if (profileData) {
        const pd = profileData as any;
        setProfile({ name: pd.name, email: pd.email, photo_url: pd.photo_url || "", blood_type: pd.blood_type || "" });
      }
      if (!profileData?.id) return;
      const { data: student } = await supabase.from("students").select("id,referral_link,referral_code,is_influencer").eq("profile_id", profileData.id).maybeSingle();
      if (!student?.id) return;
      setStudentId(student.id);
      setIsInfluencer(Boolean((student as any).is_influencer));
      setReferralLink((student as any).referral_link || `/r/${(student as any).referral_code || "ALUNO2026"}`);
      setReferralCode((student as any).referral_code || "ALUNO2026");
      const { data: walletData } = await supabase.from("student_wallets").select("available_balance,pending_balance,total_earned,fitcoin_balance" as never).eq("student_id", student.id).maybeSingle();
      setWallet({
        available_balance: Number((walletData as any)?.available_balance || 0),
        pending_balance: Number((walletData as any)?.pending_balance || 0),
        total_earned: Number((walletData as any)?.total_earned || 0),
        fitcoin_balance: Number((walletData as any)?.fitcoin_balance || 0),
      });
      const [referralRes, withdrawalRes, enrollmentRes] = await Promise.all([
        supabase
          .from("students")
          .select("id,created_at,profiles!students_profile_id_fkey(name,email)")
          .eq("referred_by_student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("student_withdrawal_requests")
          .select("id,amount,status,requested_at,paid_at")
          .eq("student_id", student.id)
          .order("requested_at", { ascending: false })
          .limit(10),
        supabase
          .from("competition_enrollments")
          .select("id,competition_id,initial_date,final_date,initial_weight,final_weight,result_kg,result_pct,status,enrolled_at,competitions(month,year,status)")
          .eq("student_id", student.id)
          .order("enrolled_at", { ascending: false }),
      ]);
      setReferrals((referralRes.data as unknown as typeof referrals) || []);
      setWithdrawals((withdrawalRes.data as unknown as typeof withdrawals) || []);
      setEnrollments((enrollmentRes.data as unknown as Enrollment[]) || []);
      try {
        const { data: toks } = await supabase
          .from("student_challenge_tokens")
          .select("id, consumed_at")
          .eq("student_id", student.id)
          .is("consumed_at", null);
        setChallengeTokens(((toks as unknown[]) || []).length);
      } catch (e) { console.warn("tokens fetch failed", e); }
      try {
        const hist = await fetchTokenHistory();
        setTokenHistory(hist);
      } catch (e) { console.warn("token history fetch failed", e); }
      try {
        const mapped = await fetchReferralCommissions();
        setReferralCommissions(mapped);
      } catch (e) { console.warn("referral commissions fetch failed", e); }


      // Tornar subcoach quando há ao menos 1 comissão paga/disponível
      try {
        const { count } = await supabase
          .from("commissions")
          .select("id", { count: "exact", head: true })
          .eq("is_referral", true as never)
          .eq("referred_by_student_id", student.id as never)
          .in("status", ["paid", "available"] as never);
        setIsSubcoach((count || 0) > 0);
      } catch (e) { console.warn("subcoach check failed", e); }

      // Diferença de peso (primeira vs última bioimpedância)
      try {
        const { data: assess } = await supabase
          .from("coach_body_assessments")
          .select("weight,assessment_date")
          .eq("student_id", student.id)
          .not("weight", "is", null)
          .order("assessment_date", { ascending: true });
        const list = (assess as { weight: number | null; assessment_date: string }[] | null) || [];
        if (list.length >= 2) {
          const first = Number(list[0].weight);
          const last = Number(list[list.length - 1].weight);
          if (Number.isFinite(first) && Number.isFinite(last)) setBioWeightDiff(first - last);
        }
      } catch (e) { console.warn("bio diff failed", e); }
    })();
  }, []);

  if (location.pathname !== "/student/profile") return <Outlet />;

  const requestWithdrawal = async () => {
    if (!studentId) return toast.error("Aluno não encontrado");
    const amount = Number(withdrawAmount.replace(",", "."));
    if (amount < 50) return toast.error("Saque mínimo: R$ 50,00");
    if (amount > wallet.available_balance) return toast.error("Saldo disponível insuficiente");
    if (!pixKey || !holderName || !holderCpf) return toast.error("Preencha os dados do PIX");
    const { error } = await supabase.from("student_withdrawal_requests").insert({
      student_id: studentId,
      amount,
      pix_key: pixKey,
      pix_key_type: pixKeyType,
      holder_name: holderName,
      holder_cpf: holderCpf,
      status: "requested",
    } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Saque solicitado!");
      setWithdrawals((current) => [{ id: crypto.randomUUID(), amount, status: "requested", requested_at: new Date().toISOString(), paid_at: null }, ...current]);
      setWithdrawOpen(false);
    }
  };

  const copyReferral = async () => {
    await navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  const totalKgLost = enrollments.reduce((sum, e) => sum + (Number(e.result_kg) > 0 ? Number(e.result_kg) : 0), 0);
  const challengesCount = enrollments.length;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold text-white">Perfil</h1>
      </header>

      {/* Profile card */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/40 overflow-hidden">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-primary">{profile.name.charAt(0)}</span>
            )}
          </div>
          <button onClick={() => navigate({ to: "/student/profile/edit" })} className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2" style={{ borderColor: "#1A1A1A" }}>
            <Camera className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-white">{profile.name}</p>
          <p className="text-xs text-white/50">{profile.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            
            {isInfluencer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-bold text-fuchsia-300"><Sparkles className="h-3 w-3" /> Influencer</span>
            )}
            {isSubcoach && !isInfluencer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"><Star className="h-3 w-3" /> Subcoach</span>
            )}
            {profile.blood_type && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">🩸 {profile.blood_type}</span>
            )}
            {challengeTokens > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">🎟️ {challengeTokens} ticket{challengeTokens > 1 ? "s" : ""} de desafio</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats reais */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowChallengesModal(true)} className="rounded-2xl p-3 text-center transition hover:bg-white/5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-0.5 flex items-center justify-center gap-1">
            <Trophy className="h-3 w-3 text-primary" />
            <p className="text-base font-bold text-white">{challengesCount}</p>
          </div>
          <p className="text-[10px] text-white/40">Desafios participados</p>
          <p className="mt-0.5 text-[9px] text-primary">Ver histórico →</p>
        </button>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-white">{bioWeightDiff != null ? `${bioWeightDiff > 0 ? "-" : "+"}${Math.abs(bioWeightDiff).toFixed(1)}` : (totalKgLost > 0 ? `-${totalKgLost.toFixed(1)}` : "0")}</p>
          <p className="text-[10px] text-white/40">kg perdidos {bioWeightDiff != null ? "(bioimpedância)" : "no total"}</p>
        </div>
      </div>


      {/* Histórico de moedas de desafio */}
      {tokenHistory.length > 0 && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <button onClick={() => setShowTokenHistory((v) => !v)} className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-white">Tickets de desafio</p>
              <span className="text-[10px] text-white/40">({tokenHistory.length} total · {tokenHistory.filter((t) => !t.consumedAt).length} disponíveis)</span>
            </div>
            <ChevronRight className={`h-4 w-4 text-white/40 transition ${showTokenHistory ? "rotate-90" : ""}`} />
          </button>
          {showTokenHistory && (
            <div className="mt-3 space-y-2">
              {tokenHistory.map((t) => (
                <div key={t.id} className="rounded-lg border border-white/5 p-3 text-xs" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.consumedAt ? "bg-white/10 text-white/60" : "bg-success/20 text-success"}`}>
                      {t.consumedAt ? "Usada" : "Disponível"}
                    </span>
                    <span className="text-[10px] text-white/40">Gerada em {new Date(t.grantedAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {t.consumedAt && (
                    <div className="mt-2 text-[11px] text-white/70">
                      Usada em <strong>{new Date(t.consumedAt).toLocaleDateString("pt-BR")}</strong>
                      {t.competitionLabel && <> para entrar em <strong className="text-primary">{t.competitionLabel}</strong></>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fitcoin (cashback de indicações) */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2">
          <img src={fitcoinAsset.url} alt="Fitcoin" className="h-6 w-6 object-contain" />
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Fitcoin · Cashback</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <img src={fitcoinAsset.url} alt="" aria-hidden className="h-7 w-7 object-contain" />
          <p className="text-3xl font-bold text-white">{wallet.fitcoin_balance.toFixed(2).replace(".", ",")} FC</p>
        </div>
        <p className="text-[11px] text-white/40">
          1 Fitcoin = R$ 1,00 · use como desconto nas suas compras na loja.
        </p>
        <p className="mt-2 text-[10px] text-white/40">
          Ganhe Fitcoin indicando produtos elegíveis. O cashback não é sacável em dinheiro.
        </p>
        <button
          onClick={() => setReferralModalOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/20"
        >
          <Gift className="h-4 w-4" />
          Indique e ganhe
        </button>
      </div>


      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setShowReferralsModal(true)}
          className="rounded-2xl p-4 text-left transition hover:bg-white/5"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Minhas indicações</h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{Math.max(referrals.length, referralCommissions.length)}</span>
          </div>
          {referralCommissions.length === 0 && referrals.length === 0 ? (
            <p className="text-xs text-white/45">Nenhum amigo entrou pelo seu link ainda.</p>
          ) : referralCommissions.length > 0 ? (
            <>
              <div className="space-y-2">
                {referralCommissions.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{c.buyer_name || "Cliente"}</p>
                      <p className="truncate text-[10px] text-white/40">{c.product_label || "Produto"}</p>
                    </div>
                    <span className="text-[10px] font-bold text-primary">+R$ {c.amount.toFixed(2).replace(".", ",")}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-primary">Ver comissões →</p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                {referrals.slice(0, 3).map((referral) => (
                  <div key={referral.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{referral.profiles?.name || "Aluno indicado"}</p>
                      <p className="truncate text-[10px] text-white/40">{referral.profiles?.email || "cadastro confirmado"}</p>
                    </div>
                    <span className="text-[10px] text-white/35">{referral.created_at ? new Date(referral.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-primary">Ver comissões →</p>
            </>
          )}
        </button>


        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Saques</h2>
            <span className="text-[10px] font-bold uppercase text-white/35">histórico</span>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-xs text-white/45">Você ainda não solicitou saques.</p>
          ) : (
            <div className="space-y-2">
              {withdrawals.slice(0, 4).map((withdrawal) => (
                <div key={withdrawal.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-white">R$ {Number(withdrawal.amount).toFixed(2).replace(".", ",")}</p>
                    <p className="text-[10px] text-white/40">{withdrawal.requested_at ? new Date(withdrawal.requested_at).toLocaleDateString("pt-BR") : "—"}</p>
                  </div>
                  <StatusPill status={withdrawal.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 px-1">
            {section.title}
          </h2>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
            {section.items.map((it, i) => {
              const target = "to" in it && it.to ? it.to : null;
              const search = ("search" in it ? (it as { search?: Record<string, unknown> }).search : undefined);
              const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] cursor-pointer ${
                i !== section.items.length - 1 ? "border-b border-white/5" : ""
              }`;
              const body = (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                    <it.icon className="h-4 w-4 text-white/70" />
                  </div>
                  <span className="flex-1 text-sm text-white">{it.label}</span>
                  <ChevronRight className="h-4 w-4 text-white/30" />
                </>
              );
              return target ? (
                <a
                  key={it.label}
                  href={target}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate({ to: target as never, search: (search ?? undefined) as never });
                  }}
                  className={cls}
                >
                  {body}
                </a>
              ) : (
                <button key={it.label} type="button" className={cls}>{body}</button>
              );
            })}

          </div>
        </div>
      ))}

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        style={{ backgroundColor: "#1A1A1A" }}
      >
        <LogOut className="h-4 w-4" />
        Sair da conta
      </button>

      <p className="text-center text-[10px] text-white/20 mt-2">FitMind Club v1.0.0</p>

      <StudentReferralModal
        open={referralModalOpen}
        onClose={() => setReferralModalOpen(false)}
        referralCode={referralCode}
      />

      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-white/10 bg-card p-5">
            <h2 className="text-lg font-bold text-white">Solicitar saque</h2>
            <p className="mt-1 text-xs text-white/50">Disponível: R$ {wallet.available_balance.toFixed(2).replace(".", ",")}</p>
            <div className="mt-4 space-y-3">
              <Field label="Valor a sacar">
                <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="field-control" />
              </Field>
              <Field label="Nome do titular">
                <input value={holderName} onChange={(event) => setHolderName(event.target.value)} className="field-control" />
              </Field>
              <Field label="CPF do titular">
                <input value={holderCpf} onChange={(event) => setHolderCpf(event.target.value)} className="field-control" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo da chave">
                  <select value={pixKeyType} onChange={(event) => setPixKeyType(event.target.value)} className="field-control">
                    <option value="cpf">CPF</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Aleatória</option>
                  </select>
                </Field>
                <Field label="Chave PIX">
                  <input value={pixKey} onChange={(event) => setPixKey(event.target.value)} className="field-control" />
                </Field>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setWithdrawOpen(false)} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white">Cancelar</button>
              <button onClick={requestWithdrawal} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showChallengesModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowChallengesModal(false)}>
          <div className="w-full max-w-[430px] rounded-3xl border border-white/10 bg-card p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Histórico de desafios</h2>
              <button onClick={() => setShowChallengesModal(false)} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {enrollments.length === 0 ? (
              <p className="text-sm text-white/50">Você ainda não participou de nenhum desafio.</p>
            ) : (
              <div className="space-y-2">
                {enrollments.map((e) => {
                  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                  const label = e.competitions ? `${monthNames[(e.competitions.month - 1) % 12]}/${e.competitions.year}` : "Desafio";
                  const kg = Number(e.result_kg);
                  const pct = Number(e.result_pct);
                  return (
                    <div key={e.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-white">{label}</p>
                          <p className="text-[10px] text-white/40">
                            {e.initial_date ? new Date(e.initial_date).toLocaleDateString("pt-BR") : "—"}
                            {e.final_date && <> → {new Date(e.final_date).toLocaleDateString("pt-BR")}</>}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.status === "completed" ? "bg-success/20 text-success" : e.status === "enrolled" ? "bg-primary/20 text-primary" : "bg-white/10 text-white/60"}`}>
                          {e.status === "completed" ? "Concluído" : e.status === "enrolled" ? "Em andamento" : e.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-[9px] uppercase text-white/40">Inicial</p>
                          <p className="text-sm font-bold text-white">{e.initial_weight ?? "—"}<span className="text-[9px] text-white/40"> kg</span></p>
                        </div>
                        <div className="rounded-lg bg-white/5 p-2">
                          <p className="text-[9px] uppercase text-white/40">Final</p>
                          <p className="text-sm font-bold text-white">{e.final_weight ?? "—"}<span className="text-[9px] text-white/40"> kg</span></p>
                        </div>
                        <div className="rounded-lg bg-primary/10 p-2">
                          <p className="text-[9px] uppercase text-primary/80">Resultado</p>
                          <p className="text-sm font-bold text-primary">{Number.isFinite(kg) && kg !== 0 ? `${kg > 0 ? "-" : "+"}${Math.abs(kg).toFixed(1)} kg` : "—"}</p>
                          {Number.isFinite(pct) && pct !== 0 && <p className="text-[9px] text-primary/70">{pct.toFixed(1)}%</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showReferralsModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowReferralsModal(false)}>
          <div className="w-full max-w-[430px] rounded-3xl border border-white/10 bg-card p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Minhas indicações</h2>
                <p className="text-[11px] text-white/40">{referralCommissions.length} comissão(ões) · total ganho R$ {referralCommissions.reduce((s, c) => s + c.amount, 0).toFixed(2).replace(".", ",")}</p>
              </div>
              <button onClick={() => setShowReferralsModal(false)} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {referralCommissions.length === 0 ? (
              <p className="text-sm text-white/50">Nenhuma comissão de indicação ainda. Quando alguém usar seu link e fizer uma compra, aparece aqui.</p>
            ) : (
              <div className="space-y-2">
                {referralCommissions.map((c) => {
                  const statusLabel = c.status === "paid" ? "Pago" : c.status === "available" ? "Disponível" : c.status === "pending" ? "Pendente" : c.status === "cancelled" ? "Cancelado" : c.status || "—";
                  const statusColor = c.status === "paid" || c.status === "available" ? "bg-success/20 text-success" : c.status === "cancelled" ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60";
                  return (
                    <div key={c.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{c.buyer_name || "Cliente"}</p>
                          <p className="truncate text-[11px] text-white/50">{c.product_label || "Produto"}</p>
                          <p className="mt-0.5 text-[10px] text-white/35">{new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}{c.gross_amount != null && <> · venda R$ {c.gross_amount.toFixed(2).replace(".", ",")}</>}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary">+R$ {c.amount.toFixed(2).replace(".", ",")}</p>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const Icon = status === "paid" ? CheckCircle2 : status === "rejected" ? XCircle : Clock;
  const label = status === "paid" ? "Pago" : status === "approved" ? "Aprovado" : status === "rejected" ? "Recusado" : "Pendente";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
