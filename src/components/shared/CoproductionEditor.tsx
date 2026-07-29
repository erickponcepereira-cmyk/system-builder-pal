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
  searchCoproducerCandidates,
  resolveCoproducerCode,
  type CoproducerHit,
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
  const update = useServerFn(updateCoproduction);
  const listCandidates = useServerFn(listCoproducerCandidates);
  const searchCandidates = useServerFn(searchCoproducerCandidates);
  const resolveCode = useServerFn(resolveCoproducerCode);

  const [items, setItems] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CoproducerHit[]>([]);
  const [results, setResults] = useState<CoproducerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CoproducerHit | null>(null);
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

  const resetForm = () => {
    setPicked(null); setCode(""); setUseCode(false); setSearch(""); setResults([]);
    setSplitKind("percent"); setPercent(""); setAmount("");
    setHasCost(false); setCostAmount(""); setCostBearer("creator"); setSplitBase("net");
    setEditingId(null);
  };

  const openInvite = async () => {
    resetForm();
    setOpenModal(true);
    if (candidates.length === 0) {
      try {
        const r = await listCandidates({ data: { excludeType: creatorType, excludeId: creatorId } });
        setCandidates(r.items.map((c) => ({ ...c, emailMasked: null, code: null })));
      } catch (e: any) { toast.error(e.message); }
    }
  };

  // Busca unificada: e-mail, nome ou código (debounce)
  useEffect(() => {
    const term = search.trim();
    if (!openModal || editingId || picked) return;
    if (term.length < 3) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const looksLikeCode = /^[A-Za-z0-9]{6,12}$/.test(term) && !term.includes("@");
        const hits: CoproducerHit[] = [];
        if (looksLikeCode) {
          const byCode = await resolveCode({ data: { code: term } });
          if (byCode && !(byCode.type === creatorType && byCode.id === creatorId)) hits.push(byCode);
        }
        const r = await searchCandidates({ data: { query: term, excludeType: creatorType, excludeId: creatorId } });
        r.items.forEach((it) => {
          if (!hits.some((h) => h.type === it.type && h.id === it.id)) hits.push(it);
        });
        if (!cancelled) setResults(hits);
      } catch (e: any) {
        if (!cancelled) { setResults([]); toast.error(e.message); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, openModal, editingId, picked]);

  const openEdit = (it: any) => {
    setEditingId(it.id);
    setPicked({ type: it.collaborator_type, id: it.collaborator_id, name: it.collaboratorName, emailMasked: null, code: null });
    setUseCode(false); setCode("");
    setSplitKind(it.split_kind === "fixed" ? "fixed" : "percent");
    setPercent(it.split_kind === "percent" ? String(Number(it.percent_of_net || 0)) : "");
    setAmount(it.split_kind === "fixed" ? String(Number(it.fixed_amount_brl || 0)) : "");
    setHasCost(!!it.has_cost);
    setCostAmount(it.has_cost ? String(Number(it.cost_amount_brl || 0)) : "");
    setCostBearer(it.has_cost && it.cost_bearer_type === it.collaborator_type && it.cost_bearer_id === it.collaborator_id ? "collaborator" : "creator");
    setSplitBase((it.split_base as any) || (it.has_cost ? "net_after_cost" : "net"));
    setOpenModal(true);
  };

  const activeItems = items.filter((i) => i.status !== "rejected" && i.status !== "cancelled" && i.id !== editingId);

  // Base efetiva por item — se o item tem custo, aplicar sobre a base escolhida (bruto/liquido/liq-custo).
  const baseForItem = (splitBaseVal: string | null | undefined, hasCostVal: boolean, costVal: number) => {
    const c = hasCostVal ? Math.max(0, costVal) : 0;
    if (splitBaseVal === "gross") return Math.max(0, grossValue - c);
    if (splitBaseVal === "net_after_cost") return Math.max(0, netValue - c);
    return Math.max(0, netValue); // "net" ignora custo na base
  };

  // Quanto o coprodutor recebe em R$ (no cartão) para um item já persistido.
  const amountForItem = (it: any) => {
    if (it.split_kind === "percent") {
      const b = baseForItem(it.split_base, !!it.has_cost, Number(it.cost_amount_brl || 0));
      return (b * Number(it.percent_of_net || 0)) / 100;
    }
    return Number(it.fixed_amount_brl || 0);
  };
  const reimburseForItem = (it: any) =>
    it.has_cost && it.cost_bearer_type === it.collaborator_type && it.cost_bearer_id === it.collaborator_id
      ? Number(it.cost_amount_brl || 0)
      : 0;
  const pixOf = (v: number) => v * (1 + PIX_UPLIFT_PCT / 100);

  // Total já comprometido (split cartão) + custos que saem do criador.
  const committedInBrl = activeItems.reduce((s, i) => s + amountForItem(i), 0);
  const creatorCostOut = activeItems.reduce(
    (s, i) => s + (i.has_cost && !(i.cost_bearer_type === i.collaborator_type && i.cost_bearer_id === i.collaborator_id) ? Number(i.cost_amount_brl || 0) : 0),
    0,
  );
  const remainingBrl = Math.max(0, netValue - committedInBrl - creatorCostOut);
  const totalPercent = activeItems.reduce((s, i) => s + (i.split_kind === "percent" ? Number(i.percent_of_net || 0) : 0), 0);

  const previewAmount = useMemo(() => {
    if (splitKind === "percent") {
      const p = Number(percent) || 0;
      return (effectiveBase * p) / 100;
    }
    return Number(amount) || 0;
  }, [splitKind, percent, amount, effectiveBase]);

  const creatorShare = useMemo(() => {
    // Criador recebe: netValue − split do coprodutor − custo (se bearer for coprodutor sai da conta do criador para reembolso).
    const costOut = hasCost && costBearer === "collaborator" ? costValue : 0;
    return Math.max(0, netValue - previewAmount - costOut);
  }, [netValue, previewAmount, hasCost, costBearer, costValue]);

  if (!productId) {
    return <p className="text-xs text-white/40">Salve o produto primeiro para adicionar co-produtores.</p>;
  }

  const submit = async () => {
    if (!editingId && !picked) {
      toast.error("Busque e selecione o coprodutor por e-mail, nome ou código.");
      return;
    }
    if (false && !useCode && !code) {
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
      if (editingId) {
        await update({
          data: {
            id: editingId,
            splitKind,
            percentOfNet: splitKind === "percent" ? Number(percent) : undefined,
            fixedAmountBrl: splitKind === "fixed" ? Number(amount) : undefined,
            hasCost,
            costAmountBrl: hasCost ? costValue : undefined,
            costBearer: hasCost ? costBearer : undefined,
            splitBase: hasCost ? splitBase : undefined,
          },
        });
        toast.success("Co-produção atualizada.");
      } else {
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
      }
      setOpenModal(false);
      resetForm();
      reload();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  // Sem busca: sugestões da própria rede. Com busca: resultados globais (e-mail/nome/código).
  const visibleOptions: CoproducerHit[] = search.trim().length >= 3
    ? results
    : candidates.slice(0, 30);

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
          {" "}Líquido a distribuir: <span className="text-white">{BRL(netValue)}</span>
          {creatorCostOut > 0 && <> · Custo (você): <span className="text-white">{BRL(creatorCostOut)}</span></>}
          {" "}· Comprometido: <span className="text-white">{BRL(committedInBrl)}</span> ·
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

      {items.map((it) => {
        const cardAmt = amountForItem(it);
        const reimb = reimburseForItem(it);
        const cardTotal = cardAmt + reimb;
        const pixTotal = pixOf(cardTotal);
        const baseLabel = it.split_base === "gross" ? "bruto" : it.split_base === "net_after_cost" ? "líquido pós-custo" : "líquido";
        return (
          <div key={it.id} className="flex items-start justify-between rounded-lg p-2 gap-2" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs text-white truncate">{it.collaboratorName}</p>
              <p className="text-[10px] text-white/50">
                {it.split_kind === "percent"
                  ? <>{Number(it.percent_of_net).toFixed(2)}% do {baseLabel}</>
                  : <>Valor fixo {BRL(Number(it.fixed_amount_brl))}</>}
                {" · "}
                <span className={it.status === "accepted" ? "text-green-400" : it.status === "rejected" ? "text-red-400" : "text-amber-400"}>
                  {it.status === "pending" ? "aguardando aceite" : it.status}
                </span>
              </p>
              {it.has_cost && (
                <p className="text-[10px] text-white/50">
                  Custo: <span className="text-white">{BRL(Number(it.cost_amount_brl || 0))}</span> — assumido por{" "}
                  <span className="text-white">
                    {it.cost_bearer_type === it.collaborator_type && it.cost_bearer_id === it.collaborator_id ? "coprodutor" : "criador"}
                  </span>
                </p>
              )}
              <p className="text-[10px] text-white/70">
                Cartão: <strong className="text-primary">{BRL(cardTotal)}</strong>
                {reimb > 0 && <span className="text-white/50"> (split {BRL(cardAmt)} + reembolso custo {BRL(reimb)})</span>}
              </p>
              <p className="text-[10px] text-white/70">
                PIX (~+{PIX_UPLIFT_PCT.toFixed(2)}%): <strong className="text-primary">{BRL(pixTotal)}</strong>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(it)} className="text-primary p-1.5" title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Excluir co-produção com ${it.collaboratorName}?`)) return;
                  try { await cancel({ data: { id: it.id } }); toast.success("Co-produção removida."); reload(); }
                  catch (e: any) { toast.error(e.message); }
                }}
                className="text-red-400 p-1.5"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-[11px] text-white/30">Nenhum coprodutor.</p>}

      {openModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#0F0F0F" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{editingId ? "Editar coprodutor" : "Novo coprodutor"}</h3>
              <button onClick={() => { setOpenModal(false); resetForm(); }} className="text-white/60"><X className="h-4 w-4" /></button>
            </div>

            {editingId ? (
              <div className="rounded-lg px-3 py-2 text-xs text-white" style={{ backgroundColor: "#1A1A1A" }}>
                Coprodutor: <strong>{picked?.name}</strong>
                <p className="text-[10px] text-white/40 mt-0.5">O coprodutor não pode ser alterado. Para trocar, exclua e crie um novo.</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-white/40" />
                  <input
                    value={search} onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
                    placeholder="Buscar por e-mail, nome ou código..."
                    className="w-full rounded-lg bg-black/40 border border-white/10 pl-7 pr-2 py-2 text-xs text-white"
                  />
                </div>
                {picked ? (
                  <div className="rounded-lg px-3 py-2 text-xs text-white flex items-center justify-between" style={{ backgroundColor: "#132a19" }}>
                    <span>
                      Selecionado: <strong>{picked.name}</strong>
                      <span className="block text-[10px] text-white/50">
                        {picked.type === "partner" ? "Parceiro" : "Profissional"}
                        {picked.emailMasked ? ` · ${picked.emailMasked}` : ""}
                      </span>
                    </span>
                    <button onClick={() => setPicked(null)} className="text-white/60"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg" style={{ backgroundColor: "#1A1A1A" }}>
                    {searching && <p className="text-[11px] text-white/40 p-3 text-center">Buscando...</p>}
                    {!searching && visibleOptions.length === 0 && (
                      <p className="text-[11px] text-white/30 p-3 text-center">
                        {search.trim().length < 3 ? "Digite ao menos 3 letras do e-mail, nome ou o código." : "Nenhum resultado encontrado."}
                      </p>
                    )}
                    {visibleOptions.map((c) => (
                      <button
                        key={`${c.type}-${c.id}`}
                        onClick={() => setPicked(c)}
                        className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5"
                      >
                        <span className="min-w-0">
                          <span className="text-white truncate block">{c.name}</span>
                          {c.emailMasked && <span className="text-[10px] text-white/40">{c.emailMasked}</span>}
                        </span>
                        <span className="text-[10px] text-white/40 shrink-0 ml-2">{c.type === "partner" ? "Parceiro" : "Profissional"}</span>
                      </button>
                    ))}
                  </div>
                )}
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

            {(() => {
              const collabReimb = hasCost && costBearer === "collaborator" ? costValue : 0;
              const collabCard = previewAmount + collabReimb;
              const creatorCard = creatorShare;
              return (
                <div className="rounded-lg p-3 text-[11px] space-y-2" style={{ backgroundColor: "#1A1A1A" }}>
                  <p className="text-white/60">Preview por venda</p>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-md p-2" style={{ backgroundColor: "#0F0F0F" }}>
                      <p className="text-white/60 text-[10px] font-bold mb-1">CARTÃO</p>
                      <p className="text-white/70">Bruto: <span className="text-white">{BRL(grossValue)}</span></p>
                      <p className="text-white/70">Líquido a distribuir: <span className="text-white">{BRL(netValue)}</span></p>
                      {hasCost && (
                        <p className="text-white/70">
                          Custo ({costBearer === "creator" ? "você" : "coprodutor"}): <span className="text-white">{BRL(costValue)}</span>
                        </p>
                      )}
                      <p className="text-white/70">Base do rateio: <span className="text-white">{BRL(effectiveBase)}</span></p>
                      <p className="text-white">Coprodutor recebe: <strong className="text-primary">{BRL(collabCard)}</strong>
                        {collabReimb > 0 && <span className="text-white/50"> (split {BRL(previewAmount)} + custo {BRL(collabReimb)})</span>}
                      </p>
                      <p className="text-white/70">Você fica com: <strong className="text-white">{BRL(creatorCard)}</strong>
                        {hasCost && costBearer === "creator" && <> (custo permanece com você)</>}
                      </p>
                    </div>
                    <div className="rounded-md p-2" style={{ backgroundColor: "#0F0F0F" }}>
                      <p className="text-white/60 text-[10px] font-bold mb-1">PIX (~+{PIX_UPLIFT_PCT.toFixed(2)}%)</p>
                      <p className="text-white">Coprodutor recebe: <strong className="text-primary">{BRL(pixOf(collabCard))}</strong></p>
                      <p className="text-white/70">Você fica com: <strong className="text-white">{BRL(pixOf(creatorCard))}</strong></p>
                    </div>
                  </div>
                  {previewAmount > remainingBrl && (
                    <p className="text-red-400">⚠ Excede o disponível ({BRL(remainingBrl)})</p>
                  )}
                </div>
              );
            })()}

            <button
              onClick={submit}
              disabled={saving}
              className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-black disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Enviar convite"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
