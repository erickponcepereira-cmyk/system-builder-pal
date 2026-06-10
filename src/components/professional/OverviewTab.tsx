import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Users, Package, Link as LinkIcon, Copy, MessageCircle, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { InstallAppButton } from "@/components/InstallAppButton";

interface Props {
  coachId: string;
  profileId: string;
  coachName: string;
}

type Stats = {
  appointmentsTotal: number;
  appointmentsMonth: number;
  activeStudents: number;
  activeProducts: number;
  referralCode: string | null;
  referralLink: string | null;
  uplineCoachName: string | null;
  uplineCoachPhone: string | null;
};

const onlyDigits = (s: string | null | undefined) => (s ? s.replace(/\D/g, "") : "");

export function OverviewTab({ coachId, coachName }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        { count: apptTotal },
        { count: apptMonth },
        { data: studentsRows },
        { count: productsCount },
        { data: coachRow },
      ] = await Promise.all([
        supabase
          .from("professional_appointments" as never)
          .select("id", { count: "exact", head: true })
          .eq("professional_coach_id" as never, coachId as never)
          .neq("status" as never, "cancelled" as never),
        supabase
          .from("professional_appointments" as never)
          .select("id", { count: "exact", head: true })
          .eq("professional_coach_id" as never, coachId as never)
          .neq("status" as never, "cancelled" as never)
          .gte("starts_at" as never, monthStart.toISOString() as never),
        supabase
          .from("professional_appointments" as never)
          .select("student_id")
          .eq("professional_coach_id" as never, coachId as never)
          .neq("status" as never, "cancelled" as never),
        supabase
          .from("professional_products" as never)
          .select("id", { count: "exact", head: true })
          .eq("coach_id" as never, coachId as never)
          .eq("is_active_by_professional" as never, true as never)
          .eq("status" as never, "approved" as never),
        supabase
          .from("coaches")
          .select("referral_code,referral_link,upline_coach_id")
          .eq("id", coachId)
          .maybeSingle(),
      ]);

      const uniqueStudents = new Set(
        ((studentsRows as Array<{ student_id: string | null }> | null) || [])
          .map((r) => r.student_id)
          .filter(Boolean),
      ).size;


      let uplineName: string | null = null;
      let uplinePhone: string | null = null;
      if (coachRow?.upline_coach_id) {
        const { data: upline } = await supabase
          .from("coaches")
          .select("profiles!coaches_profile_id_fkey(name,phone)")
          .eq("id", coachRow.upline_coach_id)
          .maybeSingle();
        const p = (upline as unknown as { profiles?: { name: string | null; phone: string | null } } | null)?.profiles;
        uplineName = p?.name || null;
        uplinePhone = p?.phone || null;
      }

      setStats({
        appointmentsTotal: apptTotal || 0,
        appointmentsMonth: apptMonth || 0,
        activeStudents: uniqueStudents,
        activeProducts: productsCount || 0,
        referralCode: coachRow?.referral_code || null,
        referralLink: coachRow?.referral_link || null,
        uplineCoachName: uplineName,
        uplineCoachPhone: uplinePhone,
      });
      setLoading(false);
    })();
  }, [coachId]);

  if (loading || !stats) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const fullReferral = stats.referralLink || (stats.referralCode ? `${window.location.origin}/r/${stats.referralCode}` : "");

  const copyReferral = () => {
    if (!fullReferral) return;
    navigator.clipboard.writeText(fullReferral);
    toast.success("Link copiado!");
  };

  const teamWaLink = stats.uplineCoachPhone
    ? `https://wa.me/${onlyDigits(stats.uplineCoachPhone)}?text=${encodeURIComponent(
        `Olá ${stats.uplineCoachName || ""}! Sou ${coachName} e gostaria de saber mais sobre como montar minha equipe de profissionais.`,
      )}`
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Visão Geral</h1>
        <p className="text-sm text-white/50">Resumo do seu desempenho</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi icon={Calendar} label="Atendimentos no mês" value={stats.appointmentsMonth} subtitle={`${stats.appointmentsTotal} no total`} accent="text-primary" />
        <Kpi icon={Users} label="Alunos atendidos" value={stats.activeStudents} accent="text-blue-400" />
        <Kpi icon={Package} label="Produtos ativos" value={stats.activeProducts} accent="text-green-400" />
      </div>

      {/* Referral */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 mb-3">
          <LinkIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-white">Seu link de indicação</h2>
        </div>
        {fullReferral ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-white/80 font-mono">{fullReferral}</div>
            <button onClick={copyReferral} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 flex items-center justify-center gap-1">
              <Copy className="h-3 w-3" /> Copiar
            </button>
          </div>
        ) : (
          <p className="text-xs text-white/50">Link de indicação ainda não disponível.</p>
        )}
        <p className="mt-2 text-[11px] text-white/40">Indique novos alunos e ganhe comissões na rede.</p>
      </div>

      {/* WhatsApp group */}
      <WhatsAppGroupCard />

      {/* Build your team */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-white">Monte sua equipe de profissionais</h2>
        </div>
        <p className="text-sm text-white/70 mb-3">
          Traga outros profissionais para trabalhar na sua equipe. Converse com seu coach para mais informações.
        </p>
        {stats.uplineCoachName && (
          <p className="text-xs text-white/50 mb-3">
            Seu coach: <span className="text-white font-bold">{stats.uplineCoachName}</span>
            {stats.uplineCoachPhone && <> · <span className="text-white/70">{stats.uplineCoachPhone}</span></>}
          </p>
        )}
        {teamWaLink ? (
          <a
            href={teamWaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-green-500/15 px-4 py-2 text-xs font-bold text-green-300 hover:bg-green-500/25"
          >
            <MessageCircle className="h-3 w-3" /> Falar com meu coach no WhatsApp
          </a>
        ) : (
          <p className="text-xs text-white/40">Contato do seu coach ainda não cadastrado.</p>
        )}
      </div>

      <InstallAppButton />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, subtitle, accent }: { icon: typeof Calendar; label: string; value: number; subtitle?: string; accent: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <p className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      {subtitle && <p className="mt-1 text-[10px] text-white/40">{subtitle}</p>}
    </div>
  );
}

export default OverviewTab;
