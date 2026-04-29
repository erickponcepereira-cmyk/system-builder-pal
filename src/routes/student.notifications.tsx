import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/notifications")({ component: NotificationsPage });

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const unread = items.filter((item) => !item.is_read).length;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,title,message,action_url,is_read,created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) toast.error(error.message);
    setItems((data as NotificationRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read" as never);
    if (error) toast.error(error.message);
    else { toast.success("Notificações marcadas como lidas"); await load(); }
  };

  const openNotification = async (item: NotificationRow) => {
    if (!item.is_read) await supabase.rpc("mark_notification_read" as never, { _notification_id: item.id } as never);
    await load();
  };

  return <div className="flex flex-col gap-4 p-4 pb-6">
    <header className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-3">
        <Link to="/student" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5"><ChevronLeft className="h-5 w-5 text-white" /></Link>
        <div><p className="text-xs text-white/40 uppercase tracking-wider">Central</p><h1 className="text-2xl font-bold text-white">Notificações</h1></div>
      </div>
      <Button onClick={markAll} disabled={!unread} size="sm" className="gap-1.5"><CheckCheck className="h-4 w-4" /> Ler tudo</Button>
    </header>

    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
      <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-white">Lembretes ativos</p><p className="text-xs text-white/55">Mensagens, pagamentos, comissões e check-ins aparecem aqui.</p></div><span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{unread} novas</span></div>
    </div>

    {loading ? <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />Carregando...</div> : items.length === 0 ? <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}><Bell className="mx-auto mb-3 h-10 w-10 text-white/20" /><p className="text-sm text-white/50">Nenhuma notificação ainda.</p></div> : <div className="space-y-3">{items.map((item) => {
      const content = <article onClick={() => openNotification(item)} className={`rounded-2xl border p-4 transition-colors ${item.is_read ? "border-white/5 bg-white/[0.03]" : "border-primary/25 bg-primary/10"}`}><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15"><Bell className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="text-sm font-bold text-white">{item.title}</h2>{!item.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-1 text-xs leading-relaxed text-white/60">{item.message || "Atualização disponível."}</p><p className="mt-2 text-[10px] text-white/35">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "—"}</p></div></div></article>;
      return item.action_url ? <Link key={item.id} to={item.action_url as never}>{content}</Link> : <div key={item.id}>{content}</div>;
    })}</div>}
  </div>;
}
