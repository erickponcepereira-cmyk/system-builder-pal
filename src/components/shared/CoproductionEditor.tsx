import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Users, X, Search, Pencil } from "lucide-react";
import {
  inviteCoproducer,
  listProductCoproductions,
  cancelCoproduction,
  updateCoproduction,
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
   * taxas de gateway, impostos, sistema e comissão de coach). No PIX o
   * líquido cresce ~3,99% proporcionalmente para ambos os lados.
   */
  productNetValueBrl: number;
  productGrossValueBrl?: number;
  netFactor?: number;
}

const BRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const PIX_UPLIFT_PCT = 3.99;

export function CoproductionEditor({
  productType,
  productId,
  creatorType,
  creatorId,
  productNetValueBrl,
  productGrossValueBrl,
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

  // Custo
  const [hasCost, setHasCost] = useState(false);
  const [costAmount, setCostAmount] = useState("");
  const [costBearer, setCostBearer] = useState<"creator" | "collaborator">("creator");
  const [splitBase, setSplitBase] = useState<"gross" | "net" | "net_after_cost">("net");

  const netValue = Math.max(0, productNetValueBrl);
  const grossValue = Math.max(0, productGrossValueBrl ?? productNetValueBrl);
  const costValue = hasCost ? Math.max(0, Number(costAmount) || 0) : 0;

  const effectiveBase = useMemo(() => {
    if (splitBase === "gross") return Math.max(0, grossValue - costValue);
    if (splitBase === "net_after_cost") return Math.max(0, netValue - costValue);
    return netValue;
  }, [splitBase, grossValue, netValue, costValue]);

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
  const committedInBrl = totalFixed + (netValue * totalPercent) / 100;
  const remainingBrl = Math.max(0, netValue - committedInBrl);

  const previewAmount = useMemo(() => {
    if (splitKind === "percent") {
      const p = Number(percent) || 0;
      return (effectiveBase * p) / 100;
    }
    return Number(amount) || 0;
  }, [splitKind, percent, amount, effectiveBase]);

  const creatorShare = useMemo(() => {
    // Criador recebe: netValue − split do coprodutor − (custo, se bearer for coprodutor).
    // Se bearer for o criador, ele fica com o valor (não sai da carteira).
    const costOut = hasCost && costBearer === "collaborator" ? costValue : 0;
    return Math.max(0, netValue - previewAmount - costOut);
  }, [netValue, previewAmount, hasCost, costBearer, costValue]);

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
    if (hasCost) {
      if (!costValue || costValue <= 0) { toast.error("Informe um valor de custo válido."); return; }
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
          hasCost,
          costAmountBrl: hasCost ? costValue : undefined,
          costBearer: hasCost ? costBearer : undefined,
          splitBase: hasCost ? splitBase : undefined,
        },
      });
      toast.success("Convite enviado. O produto ficará pausado até o coprodutor aceitar.");
      setOpenModal(false);
      setPicked(null); setCode(""); setPercent(""); setAmount(""); setUseCode(false);
      setHasCost(false); setCostAmount(""); setCostBearer("creator"); setSplitBase("net");
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
          venda paga, calculado sobre o <strong className="text-white">líquido a distribuir</strong> (cartão), com opção de
          declarar <strong className="text-white">custo</strong> que é reembolsado a quem o assumiu.
        </p>
        <p className="text-white/50">
          Bruto: <span className="text-white">{BRL(grossValue)}</span> ·
          {" "}Líquido a distribuir: <span className="text-white">{BRL(netValue)}</span> ·
          {" "}Comprometido: <span className="text-white">{BRL(committedInBrl)}</span> ·
          {" "}Sua sobra: <span className="text-primary">{BRL(remainingBrl)}</span>
        </p>
        <p className="text-[10px] text-white/40">
          Em PIX o líquido cresce ~{PIX_UPLIFT_PCT.toFixed(2)}% (economia de gateway) e é rateado proporcionalmente.
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
                ? <>{Number(it.percent_of_net).toFixed(2)}% do {it.split_base === "gross" ? "bruto" : it.split_base === "net_after_cost" ? "líquido pós-custo" : "líquido"}</>
                : <>{BRL(Number(it.fixed_amount_brl))}</>}
              {it.has_cost && <> · custo {BRL(Number(it.cost_amount_brl || 0))}</>}
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
              >% da base</button>
              <button
                onClick={() => setSplitKind("fixed")}
                className={`flex-1 py-2 rounded-md text-xs ${splitKind === "fixed" ? "bg-primary text-black font-bold" : "text-white/60"}`}
              >Valor fixo (R$)</button>
            </div>

            {splitKind === "percent" ? (
              <div>
                <label className="text-[11px] text-white/60">Percentual sobre a base do rateio</label>
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

            {/* Custo */}
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#151515" }}>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  type="checkbox"
                  checked={hasCost}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setHasCost(v);
                    if (v && splitBase === "net") setSplitBase("net_after_cost");
                    if (!v) setSplitBase("net");
                  }}
                />
                Existe custo neste produto?
              </label>
              {hasCost && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-white/60">Valor do custo (R$)</label>
                    <input
                      value={costAmount} onChange={(e) => setCostAmount(e.target.value)}
                      type="number" step="0.01" min="0"
                      placeholder="Ex: 20,00"
                      className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60">Quem assumirá o custo?</label>
                    <div className="flex gap-2 rounded-lg p-1" style={{ backgroundColor: "#1A1A1A" }}>
                      <button
                        onClick={() => setCostBearer("creator")}
                        className={`flex-1 py-1.5 rounded-md text-[11px] ${costBearer === "creator" ? "bg-primary text-black font-bold" : "text-white/60"}`}
                      >Eu (criador)</button>
                      <button
                        onClick={() => setCostBearer("collaborator")}
                        className={`flex-1 py-1.5 rounded-md text-[11px] ${costBearer === "collaborator" ? "bg-primary text-black font-bold" : "text-white/60"}`}
                      >Coprodutor</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60">Base do rateio percentual</label>
                    <div className="flex gap-2 rounded-lg p-1" style={{ backgroundColor: "#1A1A1A" }}>
                      <button
                        onClick={() => setSplitBase("gross")}
                        className={`flex-1 py-1.5 rounded-md text-[11px] ${splitBase === "gross" ? "bg-primary text-black font-bold" : "text-white/60"}`}
                      >Bruto − custo</button>
                      <button
                        onClick={() => setSplitBase("net_after_cost")}
                        className={`flex-1 py-1.5 rounded-md text-[11px] ${splitBase === "net_after_cost" ? "bg-primary text-black font-bold" : "text-white/60"}`}
                      >Líquido − custo</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg p-3 text-[11px] space-y-1" style={{ backgroundColor: "#1A1A1A" }}>
              <p className="text-white/60">Preview por venda no cartão:</p>
              <p className="text-white/70">Bruto: <span className="text-white">{BRL(grossValue)}</span></p>
              <p className="text-white/70">Líquido a distribuir: <span className="text-white">{BRL(netValue)}</span></p>
              {hasCost && (
                <p className="text-white/70">
                  Custo ({costBearer === "creator" ? "você" : "coprodutor"}): <span className="text-white">{BRL(costValue)}</span>
                </p>
              )}
              <p className="text-white/70">Base do rateio: <span className="text-white">{BRL(effectiveBase)}</span></p>
              <p className="text-white">Coprodutor recebe: <strong className="text-primary">{BRL(previewAmount)}</strong>
                {hasCost && costBearer === "collaborator" && <> + custo {BRL(costValue)}</>}
              </p>
              <p className="text-white/70">Você fica com: <strong className="text-white">{BRL(creatorShare)}</strong>
                {hasCost && costBearer === "creator" && <> (custo permanece com você)</>}
              </p>
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
