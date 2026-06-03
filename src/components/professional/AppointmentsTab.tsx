import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, Loader2, X, CheckCircle2, User as UserIcon, Clock } from "lucide-react";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { useServerFn } from "@tanstack/react-start";
import { getProfessionalAppointments, type ProfessionalAppointmentItem } from "@/lib/professional-appointments.functions";
import ProfessionalStudentDetailsModal from "./ProfessionalStudentDetailsModal";

type Appointment = ProfessionalAppointmentItem;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AppointmentsTab({ coachId }: { coachId: string }) {
  const fetchAppointments = useServerFn(getProfessionalAppointments);
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "pending">("all");
  const [section, setSection] = useState<"list" | "agenda">("list");
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);

  const paidStatusesSet = new Set(["paid", "approved", "completed"]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAppointments();
      setItems(data);
    } catch (error) {
      toast.error((error as Error).message || "Erro ao carregar atendimentos");
    } finally {
      setLoading(false);
    }
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
    if (filter === "cancelled") {
      if (a.status !== "cancelled") return false;
    } else if (filter === "past") {
      if (!(a.status !== "cancelled" && new Date(a.ends_at).getTime() < now)) return false;
    } else {
      if (!(a.status === "scheduled" && new Date(a.ends_at).getTime() >= now)) return false;
    }
    if (payFilter !== "all") {
      const isPaid = !a.order_id || (a.order_status && paidStatusesSet.has(a.order_status));
      if (payFilter === "paid" && !isPaid) return false;
      if (payFilter === "pending" && isPaid) return false;
    }
    return true;
  });

  const paidStatuses = paidStatusesSet;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSection("list")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${section === "list" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
          Atendimentos
        </button>
        <button onClick={() => setSection("agenda")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${section === "agenda" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
          Minha agenda
        </button>
      </div>

      {section === "agenda" ? (
        <AvailabilityEditor coachId={coachId} />
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Atendimentos
            </h2>
            <div className="flex flex-wrap gap-2">
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
              <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px]">
                {(["all", "paid", "pending"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPayFilter(f)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      payFilter === f ? "bg-primary text-primary-foreground" : "text-white/60"
                    }`}
                  >
                    {f === "all" ? "Todos" : f === "paid" ? "Pagos" : "Pendentes"}
                  </button>
                ))}
              </div>
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
              const orderStatus = a.order_status;
              const isPendingPayment = !!a.order_id && (!orderStatus || !paidStatuses.has(orderStatus));
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
                    <button
                      type="button"
                      onClick={() => setOpenStudentId(a.student_id)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-bold text-white/60 hover:ring-2 hover:ring-primary/50"
                    >
                      {a.student_avatar_url ? (
                        <img src={a.student_avatar_url} className="h-full w-full object-cover" alt={a.student_name || "Aluno"} />
                      ) : (
                        <UserIcon className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setOpenStudentId(a.student_id)}
                        className="block max-w-full truncate text-left text-sm font-bold text-white hover:text-primary"
                      >
                        {a.student_name || "Aluno"}
                      </button>
                      <p className="text-[11px] text-white/50 truncate">
                        {a.product_name || "Consulta"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/40">
                        {a.student_coach_name && <span>Coach: <span className="text-white/70">{a.student_coach_name}</span></span>}
                        {a.seller_name && <span>Vendido por: <span className="text-white/70">{a.seller_name}</span></span>}
                        {a.order_number && <span>Pedido: <span className="text-white/70">{a.order_number}</span></span>}
                      </div>
                      <p className="mt-1 text-xs text-primary">{fmt(a.starts_at)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isPendingPayment
                          ? "bg-amber-500/20 text-amber-300"
                          : a.status === "scheduled"
                            ? "bg-blue-500/20 text-blue-300"
                            : a.status === "completed"
                              ? "bg-green-500/20 text-green-300"
                              : a.status === "cancelled"
                                ? "bg-red-500/20 text-red-300"
                                : "bg-white/10 text-white/60"
                      }`}
                    >
                      {isPendingPayment ? (
                        <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Pré-reserva · pagamento pendente</span>
                      ) : a.status === "scheduled"
                        ? "Agendado"
                        : a.status === "completed"
                          ? "Concluído"
                          : a.status === "cancelled"
                            ? "Cancelado"
                            : a.status}
                    </span>
                  </div>
                  {a.status === "scheduled" && !isPendingPayment && (
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
      )}
      {openStudentId && (
        <ProfessionalStudentDetailsModal
          studentId={openStudentId}
          onClose={() => setOpenStudentId(null)}
        />
      )}
    </div>
  );
}
