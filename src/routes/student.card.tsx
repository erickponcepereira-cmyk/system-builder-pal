import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, Clock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/card")({
  head: () => ({
    meta: [
      { title: "Minha Carteirinha — FitMind Club" },
      { name: "description", content: "Sua carteirinha digital com QR code fixo para check-in nas atividades do FitMind Club." },
    ],
  }),
  component: StudentCardPage,
});

type CardData = {
  studentId: string;
  name: string;
  email: string;
  plan: string;
  coachName: string | null;
  since: string | null;
  avatarUrl: string | null;
  validUntil: string | null;
  partnerBenefit: { partnerName: string } | null;
};

type ScanEntry = {
  id: string;
  scanned_at: string;
  location: string | null;
  scanned_by_profile_id: string | null;
};

function StudentCardPage() {
  const [card, setCard] = useState<CardData | null>(null);
  const [scans, setScans] = useState<ScanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,created_at")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!profile) {
        setLoading(false);
        return;
      }
      const { data: student } = await supabase
        .from("students")
        .select("id, card_valid_until, coach:coaches!students_coach_id_fkey(profiles!coaches_profile_id_fkey(name))")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!student) {
        setLoading(false);
        return;
      }

      const { data: activeSub } = await supabase
        .from("subscriptions")
        .select("products(name)")
        .eq("student_id", student.id)
        .eq("status", "active")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const coachName =
        (student as unknown as { coach?: { profiles?: { name?: string } } })?.coach?.profiles?.name ?? null;

      setCard({
        studentId: student.id,
        name: profile.name,
        email: profile.email,
        plan: (activeSub as unknown as { products?: { name?: string } })?.products?.name ?? "FitMind Club",
        coachName,
        since: profile.created_at,
        avatarUrl: profile.avatar_url,
        validUntil: (student as unknown as { card_valid_until?: string | null })?.card_valid_until ?? null,
      });

      const { data: scanData } = await supabase
        .from("student_checkin_scans")
        .select("id,scanned_at,location,scanned_by_profile_id")
        .eq("student_id", student.id)
        .order("scanned_at", { ascending: false })
        .limit(10);

      const { data: visitData } = await supabase
        .from("partner_visits" as never)
        .select("id, visited_at, partner_id, partners!partner_visits_partner_id_fkey(fantasy_name)" as never)
        .eq("student_id" as never, student.id as never)
        .order("visited_at" as never, { ascending: false })
        .limit(10);

      const partnerVisits: ScanEntry[] = ((visitData as unknown as Array<{ id: string; visited_at: string; partners: { fantasy_name: string } | null }>) || []).map((v) => ({
        id: `pv-${v.id}`,
        scanned_at: v.visited_at,
        location: v.partners?.fantasy_name ? `Parceiro · ${v.partners.fantasy_name}` : "Visita ao parceiro",
        scanned_by_profile_id: null,
      }));

      const merged = [...((scanData as ScanEntry[]) || []), ...partnerVisits]
        .sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())
        .slice(0, 10);
      setScans(merged);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-white/60">Carregando carteirinha…</div>;
  }

  if (!card) {
    return (
      <div className="p-6 text-sm text-white/60">
        Não foi possível carregar sua carteirinha. <Link to="/login" className="text-primary">Faça login</Link>.
      </div>
    );
  }

  const checkinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${card.studentId}`;
  const validUntilDate = card.validUntil ? new Date(card.validUntil) : null;
  const isActive = !!(validUntilDate && validUntilDate.getTime() > Date.now());
  const formattedValidUntil = validUntilDate
    ? validUntilDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Acesso e presença</p>
          <h1 className="text-2xl font-bold text-white">Minha Carteirinha</h1>
        </div>
      </header>

      {/* Carteirinha */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">FitMind Club</p>
            <p className="text-[10px] text-white/50">Carteirinha do aluno</p>
          </div>
          <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${isActive ? "bg-primary/20 text-primary" : "bg-white/10 text-white/50"}`}>
            <ShieldCheck className="h-3 w-3" /> {isActive ? "Ativa" : "Inativa"}
          </div>
        </div>

        <div className="relative mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-2 ring-primary/40">
            {card.avatarUrl ? (
              <img src={card.avatarUrl} alt={card.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-primary">{card.name.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-white">{card.name}</p>
            <p className="truncate text-[11px] text-white/55">{card.email}</p>
            <p className="mt-1 text-[11px] text-white/45">Plano: <span className="text-white/80">{card.plan}</span></p>
            {card.coachName && (
              <p className="text-[11px] text-white/45">Coach: <span className="text-white/80">{card.coachName}</span></p>
            )}
          </div>
        </div>

        {isActive ? (
          <>
            <div className="relative mt-5 flex flex-col items-center justify-center rounded-2xl bg-white p-4">
              <QRCodeSVG value={checkinUrl} size={180} level="H" includeMargin={false} />
              <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-black/60">
                ID: {card.studentId.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <p className="relative mt-3 text-center text-[11px] text-white/50">
              Apresente este QR para o seu coach registrar sua presença.
            </p>
            {formattedValidUntil && (
              <p className="relative mt-1 text-center text-[11px] font-semibold text-primary">
                Válida até {formattedValidUntil}
              </p>
            )}
          </>
        ) : (
          <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm font-bold text-white">Sua carteirinha está inativa</p>
            <p className="mt-1 text-[11px] text-white/55">
              {formattedValidUntil
                ? `Expirou em ${formattedValidUntil}. Adquira um produto com acesso à carteirinha para reativar.`
                : "Adquira um produto com acesso à carteirinha para ativar seu QR code."}
            </p>
          </div>
        )}
      </div>


      {/* Histórico de scans */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Últimos check-ins</h2>
          <span className="text-[10px] font-bold uppercase text-white/35">Histórico</span>
        </div>
        {scans.length === 0 ? (
          <p className="text-xs text-white/45">Sua carteirinha ainda não foi escaneada.</p>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {new Date(scan.scanned_at).toLocaleString("pt-BR")}
                    </p>
                    {scan.location && <p className="text-[10px] text-white/45">{scan.location}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
