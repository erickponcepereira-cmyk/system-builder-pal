import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Loader2, X, CheckCircle2, User as UserIcon } from "lucide-react";

type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_window_hours: number;
  notes: string | null;
  student_id: string;
  product_id: string;
  seller_coach_id: string | null;
  students?: { profiles?: { name: string | null; avatar_url: string | null } | null } | null;
  professional_products?: { name: string | null } | null;
  seller?: { name: string | null } | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AppointmentsTab({ coachId }: { coachId: string }) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "past" | "cancelled">("upcoming");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("professional_appointments" as never)
      .select(
        "id,starts_at,ends_at,status,cancellation_window_hours,notes,student_id,product_id,seller_coach_id,students(profiles(name,avatar_url)),professional_products(name),seller:coaches!professional_appointments_seller_coach_id_fkey(name)" as never,
      )
      .eq("professional_coach_id" as never, coachId as never)
      .order("starts_at" as never, { ascending: true });
    setItems((data as unknown as Appointment[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [coachId]);

  const cancel = async (id: string) => {
    if (!confirm("Cancelar este agendamento?")) return;
    const { error } = await supabase
      .from("professional_appointments" as never)
      .update({ status: "cancelled" } as never)
      .eq("id" as never, id as never);
    if (error) return toast.error(error.message);
    toast.success("Agendamento cancelado");
    load();
  };

  const complete = async (id: string) => {
    const { error } = await supabase
      .from("professional_appointments" as never)
      .update({ status: "completed" } as never)
      .eq("id" as never, id as never);
    if (error) return toast.error(error.message);
    toast.success("Atendimento concluído");
    load();
  };

  const now = Date.now();
  const filtered = items.filter((a) => {
    if (filter === "cancelled") return a.status === "cancelled";
    if (filter === "past")
      return a.status !== "cancelled" && new Date(a.ends_at).getTime() < now;
    return a.status === "scheduled" && new Date(a.ends_at).getTime() >= now;
  });

  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Atendimentos
        </h2>
        <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px]">
          {(["upcoming", "past", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filter === f ? "bg-primary text-primary-foreground" : "text-white/60"
              }`}
            >
              {f === "upcoming" ? "Próximos" : f === "past" ? "Realizados" : "Cancelados"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-white/10 p-10 text-center"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          <Calendar className="mx-auto mb-2 h-8 w-8 text-white/30" />
          <p className="text-sm text-white/50">Nenhum agendamento.</p>
        </div>
      ) : (
        filtered.map((a) => {
          const stProfile = a.students?.profiles;
          const canCancel =
            a.status === "scheduled" &&
            Date.now() <
              new Date(a.starts_at).getTime() -
                a.cancellation_window_hours * 3600 * 1000;
          return (
            <div
              key={a.id}
              className="rounded-2xl p-4"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-bold text-white/60">
                  {stProfile?.avatar_url ? (
                    <img src={stProfile.avatar_url} className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">
                    {stProfile?.name || "Aluno"}
                  </p>
                  <p className="text-[11px] text-white/50 truncate">
                    {a.professional_products?.name || "Consulta"}
                    {a.seller?.name ? ` · vendido por ${a.seller.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-primary">{fmt(a.starts_at)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    a.status === "scheduled"
                      ? "bg-blue-500/20 text-blue-300"
                      : a.status === "completed"
                        ? "bg-green-500/20 text-green-300"
                        : a.status === "cancelled"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-white/10 text-white/60"
                  }`}
                >
                  {a.status === "scheduled"
                    ? "Agendado"
                    : a.status === "completed"
                      ? "Concluído"
                      : a.status === "cancelled"
                        ? "Cancelado"
                        : a.status}
                </span>
              </div>
              {a.status === "scheduled" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => complete(a.id)}
                    className="flex-1 rounded-lg bg-green-500/15 px-3 py-1.5 text-[11px] font-bold text-green-300 hover:bg-green-500/25 flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Marcar concluído
                  </button>
                  <button
                    onClick={() => cancel(a.id)}
                    disabled={!canCancel}
                    title={
                      !canCancel
                        ? `Cancelamento só permitido até ${a.cancellation_window_hours}h antes`
                        : ""
                    }
                    className="flex-1 rounded-lg bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
