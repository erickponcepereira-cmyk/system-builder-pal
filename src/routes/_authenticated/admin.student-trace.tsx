import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Loader2, Copy, User, Users, Building2, FileDown, Sparkles, HelpCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminSearchStudents,
  adminTraceStudent,
  type StudentSearchResult,
  type StudentTrace,
} from "@/lib/admin-student-trace.functions";

export const Route = createFileRoute("/_authenticated/admin/student-trace")({
  component: AdminStudentTrace,
});

function AdminStudentTrace() {
  const searchFn = useServerFn(adminSearchStudents);
  const traceFn = useServerFn(adminTraceStudent);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<StudentTrace | null>(null);

  const doSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchFn({ data: { q: q.trim() } });
      setResults(r);
      if (r.length === 0) toast.info("Nenhum aluno encontrado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro na busca");
    } finally {
      setSearching(false);
    }
  };

  const loadTrace = async (studentId: string) => {
    setLoading(true);
    setTrace(null);
    try {
      const t = await traceFn({ data: { studentId } });
      setTrace(t);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao rastrear");
    } finally {
      setLoading(false);
    }
  };

  const copyReport = () => {
    if (!trace) return;
    navigator.clipboard.writeText(formatTraceAsText(trace));
    toast.success("Rastreio copiado!");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-bold">Rastrear aluno</h1>
        <p className="mt-1 text-sm text-white/60">
          Descubra a origem de qualquer aluno: quem indicou, se veio de parceiro, lead, importação Fineshape ou cadastro direto.
        </p>
      </div>

      <form onSubmit={doSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, e-mail, WhatsApp ou código de indicação"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm placeholder:text-white/40 focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching || q.trim().length < 2}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
        </button>
      </form>

      {results.length > 0 && !trace && (
        <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
          {results.map((r) => (
            <button
              key={r.studentId}
              onClick={() => loadTrace(r.studentId)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-white/5"
            >
              <div>
                <div className="font-medium">{r.name || "(sem nome)"}</div>
                <div className="text-xs text-white/60">
                  {r.email || "—"} · {r.phone || "—"}
                </div>
              </div>
              <div className="text-xs text-white/60">
                Coach: <span className="text-white/80">{r.coachName || "sem coach"}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {trace && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setTrace(null); }}
              className="text-sm text-white/60 hover:text-white"
            >
              ← Voltar aos resultados
            </button>
            <button
              onClick={copyReport}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              <Copy className="h-4 w-4" /> Copiar rastreio
            </button>
          </div>

          <Section title="Aluno" icon={User}>
            <Row label="Nome" value={trace.student.name} />
            <Row label="E-mail" value={trace.student.email} />
            <Row label="WhatsApp" value={trace.student.phone} />
            <Row label="Cidade" value={trace.student.city} />
            <Row label="Código de indicação" value={trace.student.referralCode} mono />
            <Row label="Status" value={trace.student.status} />
            <Row label="Perfil criado em" value={fmtDate(trace.student.profileCreatedAt)} />
            <Row label="Aluno criado em" value={fmtDate(trace.student.studentCreatedAt)} />
            <Row label="student_id" value={trace.student.studentId} mono small />
            <Row label="profile_id" value={trace.student.profileId} mono small />
            <Row label="user_id" value={trace.student.userId} mono small />
          </Section>

          <Section title="Coach atual" icon={Users}>
            {trace.coach ? (
              <>
                <Row label="Nome" value={trace.coach.name} />
                <Row label="E-mail" value={trace.coach.email} />
                <Row label="WhatsApp" value={trace.coach.phone} />
                <Row label="coach_id" value={trace.coach.coachId} mono small />
              </>
            ) : (
              <p className="text-sm text-white/60">Sem coach vinculado.</p>
            )}
          </Section>

          <Section title="Origem do cadastro" icon={originIcon(trace.origin.type)}>
            <OriginBlock origin={trace.origin} />
          </Section>

          <Section title="Trilha de indicação (upstream)" icon={Sparkles}>
            {trace.referralChain.length === 0 ? (
              <p className="text-sm text-white/60">Não veio por indicação de outro aluno.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="text-white/80">{trace.student.name || "Aluno"}</div>
                {trace.referralChain.map((c, i) => (
                  <div key={c.studentId} className="flex items-center gap-2 pl-4 text-white/70">
                    <span className="text-white/40">↑ nível {i + 1}</span>
                    <span>{c.name || "(sem nome)"}</span>
                    {c.code && <span className="text-xs text-white/40">· {c.code}</span>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Atividade" icon={FileDown}>
            <Row label="Última avaliação" value={fmtDate(trace.activity.lastAssessmentAt)} />
            <Row label="Última transação" value={fmtDate(trace.activity.lastTransactionAt)} />
            <Row label="Assinatura ativa" value={trace.activity.activeSubscription ? "Sim" : "Não"} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono, small }: { label: string; value: string | null | undefined; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
      <span className="w-40 shrink-0 text-white/50">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${small ? "text-xs" : ""} text-white/90 break-all`}>
        {value || "—"}
      </span>
    </div>
  );
}

function OriginBlock({ origin }: { origin: StudentTrace["origin"] }) {
  switch (origin.type) {
    case "student_referral":
      return (
        <>
          <Row label="Tipo" value="Indicação de outro aluno" />
          <Row label="Indicador" value={origin.referrerName} />
          <Row label="E-mail do indicador" value={origin.referrerEmail} />
          <Row label="Código usado" value={origin.referrerCode} mono />
          <Row label="Coach do indicador" value={origin.referrerCoachName} />
        </>
      );
    case "partner":
      return (
        <>
          <Row label="Tipo" value="Parceiro / Empresa" />
          <Row label="Parceiro" value={origin.partnerName} />
          <Row label="Código" value={origin.partnerCode} mono />
          <Row label="Cidade" value={origin.partnerCity} />
        </>
      );
    case "fineshape_import":
      return (
        <>
          <Row label="Tipo" value="Importação Fineshape" />
          <Row label="Cliente importado" value={origin.clientName} />
          <Row label="Importado por" value={origin.importedByCoachName} />
          <Row label="Data" value={fmtDate(origin.importedAt)} />
        </>
      );
    case "lead":
      return (
        <>
          <Row label="Tipo" value="Lead prévio (cadastro capturado antes do sign-up)" />
          <Row label="Origem" value={origin.source} />
          <Row label="Código usado" value={origin.referralCode} mono />
          <Row label="Coach do lead" value={origin.leadCoachName} />
          <Row label="Data do lead" value={fmtDate(origin.leadCreatedAt)} />
        </>
      );
    case "direct":
      return (
        <>
          <Row label="Tipo" value="Cadastro direto no fluxo do coach" />
          <p className="pt-1 text-xs text-white/60">{origin.note}</p>
        </>
      );
    default:
      return <Row label="Tipo" value="Origem não identificada" />;
  }
}

function originIcon(type: StudentTrace["origin"]["type"]) {
  switch (type) {
    case "student_referral": return Users;
    case "partner": return Building2;
    case "fineshape_import": return FileDown;
    case "lead": return Sparkles;
    case "direct": return User;
    default: return HelpCircle;
  }
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch { return iso; }
}

function formatTraceAsText(t: StudentTrace): string {
  const lines: string[] = [];
  lines.push(`=== RASTREIO DE ALUNO ===`);
  lines.push(`Nome: ${t.student.name || "-"}`);
  lines.push(`E-mail: ${t.student.email || "-"}`);
  lines.push(`WhatsApp: ${t.student.phone || "-"}`);
  lines.push(`Cidade: ${t.student.city || "-"}`);
  lines.push(`Código próprio: ${t.student.referralCode || "-"}`);
  lines.push(`Criado em: ${fmtDate(t.student.studentCreatedAt) || "-"}`);
  lines.push(`Coach atual: ${t.coach?.name || "sem coach"}`);
  lines.push(``);
  lines.push(`--- ORIGEM ---`);
  const o = t.origin;
  switch (o.type) {
    case "student_referral":
      lines.push(`Indicação de aluno: ${o.referrerName || "-"} (${o.referrerEmail || "-"})`);
      lines.push(`Código: ${o.referrerCode || "-"} | Coach do indicador: ${o.referrerCoachName || "-"}`);
      break;
    case "partner":
      lines.push(`Parceiro: ${o.partnerName || "-"} (código ${o.partnerCode || "-"}, ${o.partnerCity || "-"})`);
      break;
    case "fineshape_import":
      lines.push(`Importação Fineshape: cliente "${o.clientName || "-"}" por ${o.importedByCoachName || "-"} em ${fmtDate(o.importedAt) || "-"}`);
      break;
    case "lead":
      lines.push(`Lead prévio: origem "${o.source || "-"}", código ${o.referralCode || "-"}, coach ${o.leadCoachName || "-"}, em ${fmtDate(o.leadCreatedAt) || "-"}`);
      break;
    case "direct":
      lines.push(`Cadastro direto no fluxo do coach.`);
      break;
    default:
      lines.push(`Origem não identificada.`);
  }
  if (t.referralChain.length > 0) {
    lines.push(``);
    lines.push(`--- TRILHA UPSTREAM ---`);
    t.referralChain.forEach((c, i) => lines.push(`${i + 1}. ${c.name || "-"} (${c.code || "-"})`));
  }
  lines.push(``);
  lines.push(`--- ATIVIDADE ---`);
  lines.push(`Última avaliação: ${fmtDate(t.activity.lastAssessmentAt) || "-"}`);
  lines.push(`Última transação: ${fmtDate(t.activity.lastTransactionAt) || "-"}`);
  lines.push(`Assinatura ativa: ${t.activity.activeSubscription ? "Sim" : "Não"}`);
  return lines.join("\n");
}
