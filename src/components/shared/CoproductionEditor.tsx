import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Users, X, Search } from "lucide-react";
import {
  inviteCoproducer,
  listProductCoproductions,
  cancelCoproduction,
  listCoproducerCandidates,
  type OwnerType,
} from "@/lib/collab.functions";

interface Props {
  productType: OwnerType;
  productId: string | null;
  creatorType: OwnerType;
  creatorId: string;
  /**
   * Valor líquido a distribuir na venda no cartão (já descontadas todas as
   * taxas: gateway, impostos, sistema e comissão do coach). Esse é o valor
   * que o criador teria em mãos para dividir com coprodutores.
   */
  productNetValueBrl: number;
  /** @deprecated não é mais usado; base do rateio é o próprio líquido. */
  netFactor?: number;
}

const BRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

// Diferença de taxa cartão(4,98%) → PIX(0,99%) ≈ 3,99% do bruto.
// Como o líquido informado assume cartão, no PIX o líquido cresce
// proporcionalmente e ambos (criador e coprodutores) recebem o ganho junto.
const PIX_UPLIFT_PCT = 3.99;

export function CoproductionEditor({
  productType,
  productId,
  creatorType,
  creatorId,
  productNetValueBrl,
}: Props) {
  const list = useServerFn(listProductCoproductions);
  const invite = useServerFn(inviteCoproducer);
  const cancel = useServerFn(cancelCoproduction);
  const listCandidates = useServerFn(listCoproducerCandidates);

  const [items, setItems] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [candidates, setCandidates] = useState<{ type: OwnerType; id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ type: OwnerType; id: string; name: string } | null>(null);
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState("");
  const [splitKind, setSplitKind] = useState<"percent" | "fixed">("percent");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Base do rateio = líquido a distribuir informado pelo produto.
  const netEstimated = Math.max(0, productNetValueBrl);

  const reload = async () => {
    if (!productId) return;
    const r = await list({ data: { productType, productId } });
    setItems(r.items);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [productId]);

  const openInvite = async () => {
    setOpenModal(true);
    if (candidates.length === 0) {
      try {
        const r = await listCandidates({ data: { excludeType: creatorType, excludeId: creatorId } });
        setCandidates(r.items);
      } catch (e: any) { toast.error(e.message); }
    }
  };

  const activeItems = items.filter((i) => i.status !== "rejected" && i.status !== "cancelled");
  const totalPercent = activeItems.reduce((s, i) => s + (i.split_kind === "percent" ? Number(i.percent_of_net || 0) : 0), 0);
  const totalFixed = activeItems.reduce((s, i) => s + (i.split_kind !== "percent" ? Number(i.fixed_amount_brl || 0) : 0), 0);
  const committedInBrl = totalFixed + (netEstimated * totalPercent) / 100;
  const remainingBrl = Math.max(0, netEstimated - committedInBrl);

  const previewAmount = useMemo(() => {
    if (splitKind === "percent") {
      const p = Number(percent) || 0;
      return (netEstimated * p) / 100;
    }
    return Number(amount) || 0;
  }, [splitKind, percent, amount, netEstimated]);

  const creatorShare = Math.max(0, netEstimated - committedInBrl - previewAmount);

  if (!productId) {
    return <p className="text-xs text-white/40">Salve o produto primeiro para adicionar co-produtores.</p>;
  }

  const submit = async () => {
    if (!picked && (!useCode || !code.trim())) {
      toast.error("Selecione um coprodutor ou informe o código.");
      return;
    }
    if (splitKind === "percent") {
      const p = Number(percent);
      if (!p || p <= 0 || p > 100) { toast.error("Informe um % entre 0 e 100."); return; }
      if (p + totalPercent > 100) { toast.error("A soma dos percentuais ultrapassa 100%."); return; }
    } else {
      const v = Number(amount);
      if (!v || v <= 0) { toast.error("Informe um valor válido."); return; }
      if (v > remainingBrl) { toast.error(`Valor excede o disponível (${BRL(remainingBrl)}).`); return; }
    }
    setSaving(true);
    try {
      await invite({
        data: {
          productType, productId, creatorType, creatorId,
          collaboratorType: picked?.type,
          collaboratorId: picked?.id,
          collaboratorCode: !picked ? code.trim().toUpperCase() : undefined,
          splitKind,
          percentOfNet: splitKind === "percent" ? Number(percent) : undefined,
          fixedAmountBrl: splitKind === "fixed" ? Number(amount) : undefined,
        },
      });
      toast.success("Convite enviado. O produto ficará pausado até o coprodutor aceitar.");
      setOpenModal(false);
      setPicked(null); setCode(""); setPercent(""); setAmount(""); setUseCode(false);
      reload();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const filtered = candidates.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <Users className="h-4 w-4 text-primary" /> Co-produção
      </div>
      <div className="rounded-lg p-3 text-[11px] text-white/70 space-y-1" style={{ backgroundColor: "#0F0F0F" }}>
        <p>
          Divida ganhos com outros parceiros/profissionais. O repasse é <strong className="text-white">automático</strong> na
          venda paga, calculado sobre o <strong className="text-white">líquido a distribuir</strong> abaixo (já sem
          gateway, impostos, taxa do sistema e comissão do coach).
        </p>
        <p className="text-white/50">
          Líquido a distribuir (cartão): <span className="text-white">{BRL(netEstimated)}</span> ·
          {" "}Comprometido: <span className="text-white">{BRL(committedInBrl)}</span> ·
          {" "}Sua sobra: <span className="text-primary">{BRL(remainingBrl)}</span>
        </p>
        <p className="text-[10px] text-white/40">
          Em vendas no PIX o líquido cresce ~{PIX_UPLIFT_PCT.toFixed(2)}% (economia de taxa do gateway) e essa diferença
          é rateada proporcionalmente entre você e os coprodutores.
        </p>
      </div>

      <button
        onClick={openInvite}
        className="w-full rounded-lg bg-primary/20 py-2 text-xs text-primary flex items-center justify-center gap-1 hover:bg-primary/30"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar coprodutor
      </button>

      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between rounded-lg p-2" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="min-w-0">
            <p className="text-xs text-white truncate">{it.collaboratorName}</p>
            <p className="text-[10px] text-white/50">
              {it.split_kind === "percent"
                ? <>{Number(it.percent_of_net).toFixed(2)}% do líquido (~{BRL((netEstimated * Number(it.percent_of_net || 0)) / 100)})</>
                : <>{BRL(Number(it.fixed_amount_brl))}</>}
              {" · "}
              <span className={it.status === "accepted" ? "text-green-400" : it.status === "rejected" ? "text-red-400" : "text-amber-400"}>
                {it.status === "pending" ? "aguardando aceite" : it.status}
              </span>
            </p>
          </div>
          {it.status !== "accepted" && (
            <button onClick={async () => { await cancel({ data: { id: it.id } }); reload(); }} className="text-red-400 p-1.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="text-[11px] text-white/30">Nenhum coprodutor.</p>}

      {openModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpenModal(false)}>
          <div className="w-full max-w-md rounded-xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#0F0F0F" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Novo coprodutor</h3>
              <button onClick={() => setOpenModal(false)} className="text-white/60"><X className="h-4 w-4" /></button>
            </div>

            {!useCode ? (
              <>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-white/40" />
                  <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar parceiro/profissional..."
                    className="w-full rounded-lg bg-black/40 border border-white/10 pl-7 pr-2 py-2 text-xs text-white"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg" style={{ backgroundColor: "#1A1A1A" }}>
                  {filtered.length === 0 && <p className="text-[11px] text-white/30 p-3 text-center">Nenhum resultado</p>}
                  {filtered.map((c) => (
                    <button
                      key={`${c.type}-${c.id}`}
                      onClick={() => setPicked(c)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 ${picked?.id === c.id ? "bg-primary/15" : ""}`}
                    >
                      <span className="text-white truncate">{c.name}</span>
                      <span className="text-[10px] text-white/40">{c.type === "partner" ? "Parceiro" : "Profissional"}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => { setUseCode(true); setPicked(null); }} className="text-[11px] text-primary underline">
                  Fora da lista? Usar código
                </button>
              </>
            ) : (
              <>
                <input
                  value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Código do coprodutor"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white uppercase font-mono"
                />
                <button onClick={() => setUseCode(false)} className="text-[11px] text-primary underline">
                  Voltar para busca
                </button>
              </>
            )}

            <div className="flex gap-2 rounded-lg p-1" style={{ backgroundColor: "#1A1A1A" }}>
              <button
                onClick={() => setSplitKind("percent")}
                className={`flex-1 py-2 rounded-md text-xs ${splitKind === "percent" ? "bg-primary text-black font-bold" : "text-white/60"}`}
              >% do líquido</button>
              <button
                onClick={() => setSplitKind("fixed")}
                className={`flex-1 py-2 rounded-md text-xs ${splitKind === "fixed" ? "bg-primary text-black font-bold" : "text-white/60"}`}
              >Valor fixo (R$)</button>
            </div>

            {splitKind === "percent" ? (
              <div>
                <label className="text-[11px] text-white/60">Percentual sobre o líquido</label>
                <div className="flex items-center gap-2">
                  <input
                    value={percent} onChange={(e) => setPercent(e.target.value)}
                    type="number" step="0.01" min="0" max="100"
                    placeholder="Ex: 30"
                    className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                  <span className="text-xs text-white/60">%</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-white/60">Valor fixo em R$ por venda</label>
                <input
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  type="number" step="0.01" min="0"
                  placeholder="Ex: 25,00"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>
            )}

            <div className="rounded-lg p-3 text-[11px] space-y-1" style={{ backgroundColor: "#1A1A1A" }}>
              <p className="text-white/60">Preview por venda no cartão (líquido a distribuir {BRL(netEstimated)}):</p>
              <p className="text-white">Coprodutor recebe: <strong className="text-primary">{BRL(previewAmount)}</strong></p>
              <p className="text-white/70">Você fica com: <strong className="text-white">{BRL(creatorShare)}</strong></p>
              {previewAmount > remainingBrl && (
                <p className="text-red-400">⚠ Excede o disponível ({BRL(remainingBrl)})</p>
              )}
            </div>

            <button
              onClick={submit}
              disabled={saving}
              className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-black disabled:opacity-50"
            >
              {saving ? "Enviando..." : "Enviar convite"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
