import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Loader2, X, Stethoscope } from "lucide-react";

type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_window_hours: number;
  professional_coach_id: string;
  professional_products?: { name: string | null } | null;
  professional?: { name: string | null } | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function StudentAppointmentsCard() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setLoading(false);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile) return setLoading(false);
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!student) return setLoading(false);
    const { data } = await supabase
      .from("professional_appointments" as never)
      .select(
        "id,starts_at,ends_at,status,cancellation_window_hours,professional_coach_id,professional_products(name),professional:coaches!professional_appointments_professional_coach_id_fkey(name)" as never,
      )
      .eq("student_id" as never, student.id as never)
      .neq("status" as never, "cancelled" as never)
      .order("starts_at" as never, { ascending: true });
    setItems((data as unknown as Appointment[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (a: Appointment) => {
    if (!confirm(`Cancelar consulta com ${a.professional?.name || "profissional"}?`)) return;
    const { error } = await supabase
      .from("professional_appointments" as never)
      .update({ status: "cancelled" } as never)
      .eq("id" as never, a.id as never);
    if (error) return toast.error(error.message);
    toast.success("Consulta cancelada");
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const upcoming = items.filter(
    (a) => a.status === "scheduled" && new Date(a.ends_at).getTime() >= Date.now(),
  );

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Minhas consultas agendadas</h3>
      </div>
      <div className="space-y-2">
        {upcoming.map((a) => {
          const canCancel =
            Date.now() <
            new Date(a.starts_at).getTime() - a.cancellation_window_hours * 3600 * 1000;
          return (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">
                  {a.professional_products?.name || "Consulta"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  com {a.professional?.name || "profissional"}
                </p>
                <p className="mt-1 text-xs text-primary">{fmt(a.starts_at)}</p>
              </div>
              <button
                onClick={() => cancel(a)}
                disabled={!canCancel}
                title={
                  !canCancel
                    ? `Cancelamento permitido até ${a.cancellation_window_hours}h antes`
                    : "Cancelar"
                }
                className="rounded-lg bg-red-500/15 px-2 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-40 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Cancelar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
