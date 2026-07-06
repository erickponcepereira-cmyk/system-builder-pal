import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { inviteCoproducer, listProductCoproductions, cancelCoproduction, type OwnerType } from "@/lib/collab.functions";

interface Props {
  productType: OwnerType;
  productId: string | null;
  creatorType: OwnerType;
  creatorId: string;
  productNetValueBrl: number; // for validation ceiling
}

export function CoproductionEditor({ productType, productId, creatorType, creatorId, productNetValueBrl }: Props) {
  const list = useServerFn(listProductCoproductions);
  const invite = useServerFn(inviteCoproducer);
  const cancel = useServerFn(cancelCoproduction);
  const [items, setItems] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");

  const reload = async () => {
    if (!productId) return;
    const r = await list({ data: { productType, productId } });
    setItems(r.items);
  };
  useEffect(() => { reload(); }, [productId]);

  if (!productId) {
    return <p className="text-xs text-white/40">Salve o produto primeiro para adicionar co-produtores.</p>;
  }

  const totalCommitted = items.filter((i) => i.status !== "rejected" && i.status !== "cancelled").reduce((s, i) => s + Number(i.fixed_amount_brl), 0);
  const remaining = productNetValueBrl - totalCommitted;

  const add = async () => {
    const val = Number(amount);
    if (!code.trim()) { toast.error("Informe o código"); return; }
    if (!val || val <= 0) { toast.error("Informe um valor válido"); return; }
    if (val > remaining) { toast.error(`Valor excede o disponível (R$ ${remaining.toFixed(2)})`); return; }
    try {
      await invite({ data: { productType, productId, creatorType, creatorId, collaboratorCode: code, fixedAmountBrl: val } });
      toast.success("Convite enviado. O produto ficará pausado até o coprodutor aceitar.");
      setCode(""); setAmount(""); reload();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <Users className="h-4 w-4 text-primary" /> Co-produção
      </div>
      <p className="text-[11px] text-white/50">
        Divida ganhos com outros parceiros/profissionais. Valor total já comprometido: R$ {totalCommitted.toFixed(2)}. Restante disponível: R$ {Math.max(0, remaining).toFixed(2)}.
      </p>
      <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="grid grid-cols-2 gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código do coprodutor"
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white uppercase font-mono" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Valor R$"
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
        </div>
        <button onClick={add} className="w-full rounded-lg bg-primary/20 py-2 text-xs text-primary flex items-center justify-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Adicionar coprodutor
        </button>
      </div>
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between rounded-lg p-2" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="min-w-0">
            <p className="text-xs text-white truncate">{it.collaboratorName}</p>
            <p className="text-[10px] text-white/50">R$ {Number(it.fixed_amount_brl).toFixed(2)} · <span className={it.status === "accepted" ? "text-green-400" : it.status === "rejected" ? "text-red-400" : "text-amber-400"}>{it.status}</span></p>
          </div>
          {it.status !== "accepted" && <button onClick={async () => { await cancel({ data: { id: it.id } }); reload(); }} className="text-red-400 p-1.5"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
      {items.length === 0 && <p className="text-[11px] text-white/30">Nenhum coprodutor.</p>}
    </div>
  );
}
