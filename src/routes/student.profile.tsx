import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, CreditCard, Gift, Users, Award, HelpCircle, LogOut, ChevronRight, Camera, GraduationCap, Rocket, ClipboardList, Wallet, Clock, CheckCircle2, XCircle, QrCode, Building2, Activity, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getMyChallengeTokenHistory, type ChallengeTokenHistoryEntry } from "@/lib/challenge-tokens.functions";

export const Route = createFileRoute("/student/profile")({
  component: ProfilePage,
});

const sections = [
  {
    title: "Conta",
    items: [
      { icon: QrCode, label: "Minha Carteirinha", to: "/student/card" },
      { icon: Settings, label: "Editar perfil", to: "/student/profile/edit" },
      { icon: CreditCard, label: "Meus planos" },
      { icon: Award, label: "Minha evolução" },
      { icon: Activity, label: "Minhas avaliações", to: "/student/assessments" },
      { icon: ClipboardList, label: "Anamnese", to: "/student/health" },
    ],
  },
  {
    title: "Programa",
    items: [
      { icon: Gift, label: "Gratuitos", to: "/student/freebies" },
      { icon: Building2, label: "Empresas Parceiras", to: "/student/partners" },
      { icon: Users, label: "Indicar amigos" },
      { icon: GraduationCap, label: "Meus cursos", to: "/student/library" },
    ],
  },
  {
    title: "Negócios",
    items: [
      { icon: Building2, label: "Tornar-se Empresa Parceira", to: "/become-partner" },
    ],
  },
  {
    title: "Suporte",
    items: [
      { icon: HelpCircle, label: "Central de ajuda", to: "/student/support" },
    ],
  },
];

function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState({ name: "Aluno FitMind Club", email: "aluno@email.com" });
  const [studentId, setStudentId] = useState<string | null>(null);
  const [wallet, setWallet] = useState({ available_balance: 0, pending_balance: 0, total_earned: 0 });
  const [referralLink, setReferralLink] = useState("/r/ALUNO2026");
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
  const fetchTokenHistory = useServerFn(getMyChallengeTokenHistory);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profileData } = await supabase.from("profiles").select("id,name,email").eq("user_id", userData.user.id).maybeSingle();
      if (profileData) setProfile({ name: profileData.name, email: profileData.email });
      if (!profileData?.id) return;
      const { data: student } = await supabase.from("students").select("id,referral_link,referral_code").eq("profile_id", profileData.id).maybeSingle();
      if (!student?.id) return;
      setStudentId(student.id);
      setReferralLink(student.referral_link || `/r/${student.referral_code || "ALUNO2026"}`);
      const { data: walletData } = await supabase.from("student_wallets").select("available_balance,pending_balance,total_earned").eq("student_id", student.id).maybeSingle();
      setWallet({
        available_balance: Number(walletData?.available_balance || 0),
        pending_balance: Number(walletData?.pending_balance || 0),
        total_earned: Number(walletData?.total_earned || 0),
      });
      const [referralRes, withdrawalRes] = await Promise.all([
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
      ]);
      setReferrals((referralRes.data as unknown as typeof referrals) || []);
      setWithdrawals((withdrawalRes.data as unknown as typeof withdrawals) || []);
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

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold text-white">Perfil</h1>
      </header>

      {/* Profile card */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/40">
            <span className="text-xl font-bold text-primary">{profile.name.charAt(0)}</span>
          </div>
          <button className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2" style={{ borderColor: "#1A1A1A" }}>
            <Camera className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-white">{profile.name}</p>
          <p className="text-xs text-white/50">{profile.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
              🔥 Plano Premium
            </span>
            {challengeTokens > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                🪙 {challengeTokens} moeda{challengeTokens > 1 ? "s" : ""} de desafio
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-white">3</p>
          <p className="text-[10px] text-white/40">Desafios</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-white">-8.4</p>
          <p className="text-[10px] text-white/40">kg total</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-primary">A+</p>
          <p className="text-[10px] text-white/40">Nota</p>
        </div>
      </div>

      {/* Histórico de moedas de desafio */}
      {tokenHistory.length > 0 && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <button onClick={() => setShowTokenHistory((v) => !v)} className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-white">Moedas de desafio</p>
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

      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Quer fazer parte da equipe de coaches?</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/60">Torne-se um Coach FitMind Club e ganhe ajudando outras pessoas a se transformarem.</p>
            <Link to="/student/coach-course" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              <GraduationCap className="h-4 w-4" /> Fazer Curso de Coach
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Carteira de indicações</p>
            <p className="mt-1 text-2xl font-bold text-white">R$ {wallet.available_balance.toFixed(2).replace(".", ",")}</p>
            <p className="text-[11px] text-white/40">+ R$ {wallet.pending_balance.toFixed(2).replace(".", ",")} pendente · total R$ {wallet.total_earned.toFixed(2).replace(".", ",")}</p>
          </div>
          <button onClick={() => setWithdrawOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Wallet className="h-5 w-5 text-primary" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <span className="truncate font-mono text-xs text-white/60">{referralLink}</span>
          <button onClick={copyReferral} className="text-xs font-bold text-primary">Copiar</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Minhas indicações</h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{referrals.length}</span>
          </div>
          {referrals.length === 0 ? (
            <p className="text-xs text-white/45">Nenhum amigo entrou pelo seu link ainda.</p>
          ) : (
            <div className="space-y-2">
              {referrals.slice(0, 4).map((referral) => (
                <div key={referral.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{referral.profiles?.name || "Aluno indicado"}</p>
                    <p className="truncate text-[10px] text-white/40">{referral.profiles?.email || "cadastro confirmado"}</p>
                  </div>
                  <span className="text-[10px] text-white/35">{referral.created_at ? new Date(referral.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

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
                  onClick={(e) => { e.preventDefault(); navigate({ to: target as never }); }}
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
