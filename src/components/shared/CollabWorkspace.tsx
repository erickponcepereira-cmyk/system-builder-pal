import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Copy, Check, X, Trash2, Plus, Share2, Clock, Users } from "lucide-react";
import {
  getMyShareCode, listExternalAppointments, createExternalAppointment, deleteExternalAppointment,
  listCalendarShares, requestCalendarShare, respondCalendarShare, revokeCalendarShare,
  listSharedAgenda, listCoproductions, respondCoproduction, cancelCoproduction,
  getCollabPendingCounts,
  type OwnerType,
} from "@/lib/collab.functions";

interface Props { ownerType: OwnerType; ownerId: string; }

type Section = "external" | "share" | "requests" | "shared";

export function CollabWorkspace({ ownerType, ownerId }: Props) {
  const [section, setSection] = useState<Section>("external");
  const getCounts = useServerFn(getCollabPendingCounts);
  const [pendingTotal, setPendingTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => getCounts({ data: { entityType: ownerType, entityId: ownerId } })
      .then((r) => { if (alive) setPendingTotal(r.total); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [ownerType, ownerId]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {([
          ["external", "Agenda externa", Clock],
          ["share", "Compartilhar agenda", Share2],
          ["requests", "Solicitações", Users],
          ["shared", "Agendas compartilhadas", Users],
        ] as [Section, string, any][]).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setSection(k)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${section === k ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/5"}`}>
            <Icon className="h-3.5 w-3.5" /> {l}
            {k === "requests" && pendingTotal > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingTotal}
              </span>
            )}
          </button>
        ))}
      </div>
      {section === "external" && <ExternalPanel ownerType={ownerType} ownerId={ownerId} />}
      {section === "share" && <SharePanel ownerType={ownerType} ownerId={ownerId} />}
      {section === "requests" && <RequestsPanel ownerType={ownerType} ownerId={ownerId} />}
      {section === "shared" && <SharedAgendaPanel ownerType={ownerType} ownerId={ownerId} />}
    </div>
  );
}


// ---------------- External Appointments ----------------
function ExternalPanel({ ownerType, ownerId }: Props) {
  const list = useServerFn(listExternalAppointments);
  const del = useServerFn(deleteExternalAppointment);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const reload = async () => {
    setLoading(true);
    try { const r = await list({ data: { ownerType, ownerId } }); setItems(r.items); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [ownerId]);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-white/50">Bloqueie horários para vendas feitas fora da plataforma.</p>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs text-primary">
          <Plus className="h-3.5 w-3.5" /> Novo bloqueio
        </button>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /> : items.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-6">Nenhum bloqueio externo.</p>
      ) : items.map((it) => (
        <div key={it.id} className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{it.product_name}</p>
            <p className="text-[11px] text-white/50">{it.client_name} · {it.client_whatsapp || "sem whatsapp"}</p>
            <p className="text-[11px] text-white/40">{new Date(it.starts_at).toLocaleString("pt-BR")} → {new Date(it.ends_at).toLocaleString("pt-BR")}</p>
          </div>
          <button onClick={async () => { if (!confirm("Excluir bloqueio?")) return; await del({ data: { id: it.id } }); toast.success("Removido"); reload(); }}
            className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {showModal && <ExternalModal ownerType={ownerType} ownerId={ownerId} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); reload(); }} />}
    </div>
  );
}

function ExternalModal({ ownerType, ownerId, onClose, onSaved }: Props & { onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(createExternalAppointment);
  const [productName, setProductName] = useState("");
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !clientName || !startsAt || !endsAt) { toast.error("Preencha os campos obrigatórios"); return; }
    setSaving(true);
    try {
      await create({ data: { ownerType, ownerId, productName, clientName, clientWhatsapp: whatsapp, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() } });
      toast.success("Bloqueio criado");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl p-5 space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white">Bloquear horário externo</h3>
        <Input label="Nome do produto *" value={productName} onChange={setProductName} />
        <Input label="Nome do cliente *" value={clientName} onChange={setClientName} />
        <Input label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="(11) 99999-9999" />
        <Input label="Início *" type="datetime-local" value={startsAt} onChange={setStartsAt} />
        <Input label="Fim *" type="datetime-local" value={endsAt} onChange={setEndsAt} />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60">Cancelar</button>
          <button disabled={saving} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{saving ? "..." : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-xs">
      <span className="text-white/60">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
    </label>
  );
}

// ---------------- Share code ----------------
function SharePanel({ ownerType, ownerId }: Props) {
  const getCode = useServerFn(getMyShareCode);
  const listShares = useServerFn(listCalendarShares);
  const request = useServerFn(requestCalendarShare);
  const revoke = useServerFn(revokeCalendarShare);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [others, setOthers] = useState<any>({ incoming: [], outgoing: [], sharedWithMe: [] });
  const [otherCode, setOtherCode] = useState("");
  useEffect(() => {
    getCode({ data: { ownerType, ownerId } }).then((r) => setCode(r.code));
    listShares({ data: { entityType: ownerType, entityId: ownerId } }).then(setOthers);
  }, [ownerId]);
  const doRequest = async () => {
    if (!otherCode.trim()) return;
    try {
      await request({ data: { viewerType: ownerType, viewerId: ownerId, ownerCode: otherCode } });
      toast.success("Solicitação enviada");
      setOtherCode("");
      listShares({ data: { entityType: ownerType, entityId: ownerId } }).then(setOthers);
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/50 mb-2">Seu código de compartilhamento (permanente)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-black/60 px-4 py-3 text-lg font-mono font-bold text-primary tracking-widest">{code || "..."}</code>
          {code && <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="p-3 rounded-lg bg-white/5 text-white/60 hover:text-white">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>}
        </div>
      </div>
      <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-xs text-white/50">Solicitar acesso à agenda de outro parceiro/profissional</p>
        <div className="flex gap-2">
          <input value={otherCode} onChange={(e) => setOtherCode(e.target.value.toUpperCase())} placeholder="Código"
            className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white uppercase font-mono" />
          <button onClick={doRequest} className="rounded-lg bg-primary px-4 text-xs font-bold text-black">Solicitar</button>
        </div>
      </div>
      <div>
        <p className="text-xs text-white/50 mb-2">Pessoas com acesso à minha agenda</p>
        {(others.incoming.filter((s: any) => s.status === "accepted")).length === 0 ? (
          <p className="text-xs text-white/30">Ninguém ainda.</p>
        ) : others.incoming.filter((s: any) => s.status === "accepted").map((s: any) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg p-2 mb-1" style={{ backgroundColor: "#1A1A1A" }}>
            <span className="text-xs text-white">{s.viewerName}</span>
            <button onClick={async () => { await revoke({ data: { id: s.id } }); listShares({ data: { entityType: ownerType, entityId: ownerId } }).then(setOthers); }}
              className="text-red-400 text-xs">Revogar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Requests inbox (calendar + coproductions) ----------------
function RequestsPanel({ ownerType, ownerId }: Props) {
  const listShares = useServerFn(listCalendarShares);
  const respondShare = useServerFn(respondCalendarShare);
  const listCoprod = useServerFn(listCoproductions);
  const respondCoprod = useServerFn(respondCoproduction);
  const cancel = useServerFn(cancelCoproduction);
  const [shares, setShares] = useState<any>({ incoming: [], outgoing: [], sharedWithMe: [] });
  const [coprod, setCoprod] = useState<any>({ asCreator: [], asCollab: [] });
  const reload = () => {
    listShares({ data: { entityType: ownerType, entityId: ownerId } }).then(setShares);
    listCoprod({ data: { entityType: ownerType, entityId: ownerId } }).then(setCoprod);
  };
  useEffect(() => { reload(); }, [ownerId]);
  const pendingShares = shares.incoming.filter((s: any) => s.status === "pending");
  const pendingCoprod = coprod.asCollab.filter((c: any) => c.status === "pending");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-white/50 mb-2">Compartilhamento de agenda ({pendingShares.length})</p>
        {pendingShares.length === 0 ? <p className="text-xs text-white/30">Nenhuma solicitação.</p> : pendingShares.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl p-3 mb-2" style={{ backgroundColor: "#1A1A1A" }}>
            <div>
              <p className="text-sm text-white">{s.viewerName}</p>
              <p className="text-[11px] text-white/40">quer ver sua agenda</p>
            </div>
            <div className="flex gap-1">
              <button onClick={async () => { await respondShare({ data: { id: s.id, accept: true } }); toast.success("Aceito"); reload(); }} className="rounded-lg bg-green-500/20 p-2 text-green-400"><Check className="h-4 w-4" /></button>
              <button onClick={async () => { await respondShare({ data: { id: s.id, accept: false } }); reload(); }} className="rounded-lg bg-red-500/20 p-2 text-red-400"><X className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs text-white/50 mb-2">Convites de co-produção ({pendingCoprod.length})</p>
        {pendingCoprod.length === 0 ? <p className="text-xs text-white/30">Nenhum convite.</p> : pendingCoprod.map((c: any) => (
          <div key={c.id} className="rounded-xl p-3 mb-2" style={{ backgroundColor: "#1A1A1A" }}>
            <p className="text-sm text-white">{c.productName}</p>
            <p className="text-[11px] text-white/50">Criador: {c.creatorName} · Valor: R$ {Number(c.fixed_amount_brl).toFixed(2)} por venda</p>
            <div className="flex gap-2 mt-2">
              <button onClick={async () => { await respondCoprod({ data: { id: c.id, accept: true } }); toast.success("Aceito"); reload(); }} className="flex-1 rounded-lg bg-green-500/20 py-1.5 text-xs text-green-400">Aceitar</button>
              <button onClick={async () => { await respondCoprod({ data: { id: c.id, accept: false } }); reload(); }} className="flex-1 rounded-lg bg-red-500/20 py-1.5 text-xs text-red-400">Rejeitar</button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs text-white/50 mb-2">Meus convites de co-produção enviados</p>
        {coprod.asCreator.length === 0 ? <p className="text-xs text-white/30">Nenhum.</p> : coprod.asCreator.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl p-3 mb-2" style={{ backgroundColor: "#1A1A1A" }}>
            <div>
              <p className="text-sm text-white">{c.productName}</p>
              <p className="text-[11px] text-white/50">{c.collaboratorName} · R$ {Number(c.fixed_amount_brl).toFixed(2)} · <span className={c.status === "accepted" ? "text-green-400" : c.status === "rejected" ? "text-red-400" : "text-amber-400"}>{c.status}</span></p>
            </div>
            {c.status === "pending" && <button onClick={async () => { await cancel({ data: { id: c.id } }); reload(); }} className="text-red-400 p-2"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Shared agenda (read-only) ----------------
function SharedAgendaPanel({ ownerType, ownerId }: Props) {
  const listShares = useServerFn(listCalendarShares);
  const listAgenda = useServerFn(listSharedAgenda);
  const [owners, setOwners] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [agenda, setAgenda] = useState<{ externals: any[]; internals: any[] } | null>(null);
  useEffect(() => {
    listShares({ data: { entityType: ownerType, entityId: ownerId } }).then((r) => setOwners(r.sharedWithMe));
  }, [ownerId]);
  useEffect(() => {
    if (!selected) return;
    listAgenda({ data: { ownerType: selected.owner_type, ownerId: selected.owner_id } }).then(setAgenda);
  }, [selected]);
  return (
    <div className="space-y-3">
      {owners.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-6">Nenhuma agenda compartilhada com você ainda.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {owners.map((o) => (
              <button key={o.id} onClick={() => setSelected(o)} className={`px-3 py-1.5 text-xs rounded-lg ${selected?.id === o.id ? "bg-primary/20 text-primary" : "bg-white/5 text-white/60"}`}>
                {o.ownerName}
              </button>
            ))}
          </div>
          {selected && agenda && (
            <div className="space-y-2">
              {[...agenda.externals.map((e) => ({ ...e, type: "ext" })), ...agenda.internals.map((i) => ({ ...i, type: "int" }))]
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map((it) => (
                <div key={it.id} className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
                  <p className="text-xs text-white/40">{new Date(it.starts_at).toLocaleString("pt-BR")} → {new Date(it.ends_at).toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-white">{it.type === "ext" ? `${it.product_name} · ${it.client_name}` : "Atendimento interno"}</p>
                </div>
              ))}
              {agenda.externals.length + agenda.internals.length === 0 && <p className="text-xs text-white/30">Agenda vazia.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
