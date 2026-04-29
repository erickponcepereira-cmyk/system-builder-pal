import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, PackageCheck, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrders });

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  total_amount: number;
  shipping_name: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  created_at: string | null;
  students: { profiles: { name: string; email: string } | null } | null;
  store_order_items: { title: string; quantity: number; total_price: number }[] | null;
};

const statuses = ["pending", "paid", "preparing", "shipped", "delivered", "cancelled"];
const labels: Record<string, string> = { pending: "Pendente", paid: "Pago", preparing: "Preparando", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" };

function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_orders" as never)
      .select("id,order_number,status,payment_method,total_amount,shipping_name,shipping_city,shipping_state,created_at,students!store_orders_student_id_fkey(profiles!students_profile_id_fkey(name,email)),store_order_items(title,quantity,total_price)" as never)
      .order("created_at" as never, { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setOrders((data as unknown as OrderRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = orders.filter((order) => {
    const needle = query.trim().toLowerCase();
    return !needle || order.order_number.toLowerCase().includes(needle) || order.students?.profiles?.name?.toLowerCase().includes(needle) || order.students?.profiles?.email?.toLowerCase().includes(needle);
  });

  const updateStatus = async (orderId: string, status: string) => {
    setActing(orderId);
    const { error } = await supabase.from("store_orders" as never).update({ status } as never).eq("id" as never, orderId as never);
    if (error) toast.error(error.message);
    else { toast.success("Status atualizado."); await load(); }
    setActing(null);
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return <>
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-bold text-white">Pedidos da Loja</h1><p className="text-sm text-white/50">Acompanhe pagamentos, separação e entrega dos pedidos</p></div><Button onClick={load} variant="outline" className="border-white/10 text-white/70">Atualizar</Button></div>
    <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/5 px-4 py-3" style={{ backgroundColor: "#1A1A1A" }}><Search className="h-4 w-4 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, aluno ou e-mail..." className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" /></div>
    {loading ? <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />Carregando pedidos...</div> : filtered.length === 0 ? <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}>Nenhum pedido encontrado.</div> : <div className="space-y-4">{filtered.map((order) => <article key={order.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" /><h2 className="font-bold text-white">{order.order_number}</h2><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{labels[order.status] || order.status}</span></div><p className="mt-1 text-sm text-white/55">{order.students?.profiles?.name || "Aluno"} · {order.students?.profiles?.email}</p><p className="text-xs text-white/40">{order.shipping_city || "sem entrega"}{order.shipping_state ? `/${order.shipping_state}` : ""} · {order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "—"}</p></div><div className="text-right"><p className="text-xl font-bold text-white">{fmt(Number(order.total_amount || 0))}</p><p className="text-xs text-white/40">{order.payment_method}</p></div></div><div className="mt-4 grid gap-2 border-t border-white/5 pt-4">{(order.store_order_items || []).map((item, index) => <div key={`${order.id}-${index}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><span className="text-white/70">{item.quantity}x {item.title}</span><b className="text-white">{fmt(Number(item.total_price || 0))}</b></div>)}</div><div className="mt-4 flex flex-wrap gap-2">{statuses.map((status) => <Button key={status} size="sm" disabled={acting === order.id || order.status === status} onClick={() => updateStatus(order.id, status)} variant={order.status === status ? "default" : "outline"} className={order.status === status ? "" : "border-white/10 text-white/70"}>{acting === order.id && order.status !== status ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : status === "shipped" ? <Truck className="mr-1 h-3 w-3" /> : null}{labels[status]}</Button>)}</div></article>)}</div>}
  </>;
}
