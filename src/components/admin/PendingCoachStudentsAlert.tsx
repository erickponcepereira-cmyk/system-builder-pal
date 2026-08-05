import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  adminListPendingCoachStudents,
  type PendingCoachStudentRow,
} from "@/lib/pending-coach.functions";

/** Alerta de alunos recuperados que ainda não confirmaram quem é o coach. */
export function PendingCoachStudentsAlert() {
  const [rows, setRows] = useState<PendingCoachStudentRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await adminListPendingCoachStudents();
        if (active) setRows(data);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!rows.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <h2 className="text-sm font-bold text-white">
          {rows.length} aluno(s) sem coach confirmado
        </h2>
      </div>
      <p className="mb-3 text-xs text-white/60">
        Contas recuperadas de cadastros incompletos. Elas estão vinculadas provisoriamente ao coach padrão e vão
        informar o coach correto no próximo acesso ao app. Você pode falar com elas pelo WhatsApp para agilizar.
      </p>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.studentId} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{r.name}</p>
              <p className="truncate text-xs text-white/50">{r.email || "—"}</p>
            </div>
            {r.phone ? (
              <a
                href={`https://wa.me/55${r.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-400"
              >
                WhatsApp
              </a>
            ) : (
              <span className="shrink-0 text-xs text-white/30">sem telefone</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PendingCoachStudentsAlert;
