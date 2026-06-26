import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Loader2, CheckCircle2, XCircle, Ban, Instagram, Facebook, Globe,
  MessageCircle, MapPin, Eye, Users as UsersIcon, Package, ImageIcon, Camera,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPartnerDetails,
  getPartnerPublicProfile,
  reviewPartnerStatus,
  reviewPartnerProduct,
} from "@/lib/partner-approvals.functions";

type Tab = "overview" | "products" | "timeline" | "collaborators";
const allTabs: Tab[] = ["overview", "products", "timeline", "collaborators"];

function formatBenefitWindow(start?: string | null, end?: string | null) {
  const fmt = (value?: string | null) => value ? value.slice(0, 5) : null;
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `Disponível das ${s} às ${e}`;
  if (s) return `Disponível a partir das ${s}`;
  if (e) return `Disponível até ${e}`;
  return null;
}


export function PartnerDetailsModal({
  partnerId,
  onClose,
  onChanged,
  readOnly = false,
}: {
  partnerId: string;
  onClose: () => void;
  onChanged?: () => void;
  /** When true, hides admin actions (approve/block) and uses the public partner endpoint. */
  readOnly?: boolean;
}) {
  const fetchAdmin = useServerFn(getPartnerDetails);
  const fetchPublic = useServerFn(getPartnerPublicProfile);
  const setStatus = useServerFn(reviewPartnerStatus);
  const reviewProduct = useServerFn(reviewPartnerProduct);

  const visibleTabs: Tab[] = readOnly
    ? ["overview", "products", "timeline"]
    : allTabs;
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = readOnly
        ? await fetchPublic({ data: { partnerId } })
        : await fetchAdmin({ data: { partnerId } });
      setData(res);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar parceiro");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [partnerId, readOnly]);

  useEffect(() => {
    if (readOnly && tab === "collaborators") setTab("overview");
  }, [readOnly, tab]);

  const handleStatus = async (status: "approved" | "blocked" | "pending", rsn?: string) => {
    setActing(true);
    try {
      await setStatus({ data: { partnerId, status, reason: rsn } });
      toast.success(
        status === "approved" ? "Parceiro aprovado" :
        status === "blocked" ? "Parceiro bloqueado" : "Parceiro retornou para pendente",
      );
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setActing(false);
    }
  };

  const handleProduct = async (productId: string, decision: "approved" | "rejected", notes?: string) => {
    setActing(true);
    try {
      await reviewProduct({ data: { productId, decision, notes } });
      toast.success(decision === "approved" ? "Produto aprovado" : "Produto rejeitado");
      setRejectFor(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setActing(false);
    }
  };

  const posts: Array<{ id: string; image_url: string; caption: string | null; created_at: string }> =
    data?.posts ?? [];

  const waUrl = data?.partner?.whatsapp ? `https://wa.me/${String(data.partner.whatsapp).replace(/\D/g, "")}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4">
      <div
        className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl text-white"
        style={{ backgroundColor: "#111" }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Cover */}
            <div className="relative h-32 sm:h-44 bg-gradient-to-br from-primary/30 to-black overflow-hidden z-0">
              {data.partner.cover_url && (
                <img src={data.partner.cover_url} alt="" className="absolute inset-0 z-0 h-full w-full object-cover opacity-80" />
              )}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative z-10 px-4 sm:px-6 -mt-10 pb-5">
              <div className="relative z-10 flex items-end gap-3">
                {data.partner.photo_url ? (
                  <img src={data.partner.photo_url} alt={data.partner.fantasy_name} className="h-20 w-20 rounded-2xl object-cover border-4 border-[#111] shadow-xl shadow-black/40" />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-white/10 border-4 border-[#111] shadow-xl shadow-black/40 flex items-center justify-center text-2xl">🏢</div>
                )}
                <div className="pb-2">
                  <h2 className="text-lg sm:text-xl font-bold leading-tight">{data.partner.fantasy_name}</h2>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <StatusPill status={data.partner.status} />
                    {data.partner.city && (
                      <span className="text-[11px] text-white/50 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {data.partner.city}{data.partner.state ? `/${data.partner.state}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className={`mt-4 grid gap-2 ${readOnly ? "grid-cols-2" : "grid-cols-3"}`}>
                <Stat icon={Eye} label="Visitas" value={data.visits} />
                <Stat icon={Package} label="Produtos" value={data.products.length} />
                {!readOnly && <Stat icon={UsersIcon} label="Colaboradores" value={data.collaborators.length} />}
              </div>

              {/* Quick contact (read-only mode) */}
              {readOnly && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-semibold px-3 py-1.5">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  {data.partner.instagram && (
                    <a href={data.partner.instagram.startsWith("http") ? data.partner.instagram : `https://instagram.com/${String(data.partner.instagram).replace("@", "")}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/20 text-pink-400 text-xs font-semibold px-3 py-1.5">
                      <Instagram className="h-3.5 w-3.5" /> Instagram
                    </a>
                  )}
                  {data.partner.facebook && (
                    <a href={data.partner.facebook} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold px-3 py-1.5">
                      <Facebook className="h-3.5 w-3.5" /> Facebook
                    </a>
                  )}
                  {data.partner.website && (
                    <a href={data.partner.website} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-white text-xs font-semibold px-3 py-1.5">
                      <Globe className="h-3.5 w-3.5" /> Site
                    </a>
                  )}
                </div>
              )}

              {/* Admin actions */}
              {!readOnly && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.partner.status !== "approved" && (
                    <button onClick={() => handleStatus("approved")} disabled={acting}
                      className="flex items-center gap-1.5 rounded-lg bg-green-500/90 hover:bg-green-500 px-3 py-2 text-xs font-bold disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar parceiro
                    </button>
                  )}
                  {data.partner.status !== "blocked" && (
                    <button
                      onClick={() => {
                        const r = window.prompt("Motivo do bloqueio (opcional):") ?? undefined;
                        handleStatus("blocked", r || undefined);
                      }}
                      disabled={acting}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 px-3 py-2 text-xs font-bold disabled:opacity-50">
                      <Ban className="h-3.5 w-3.5" /> Bloquear
                    </button>
                  )}
                  {data.partner.status !== "pending" && (
                    <button onClick={() => handleStatus("pending")} disabled={acting}
                      className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold disabled:opacity-50">
                      Retornar para pendente
                    </button>
                  )}
                </div>
              )}

              {/* Tabs */}
              <div className="mt-5 flex gap-1 border-b border-white/10 overflow-x-auto">
                {visibleTabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap ${tab === t ? "border-primary text-primary" : "border-transparent text-white/50"}`}
                  >
                    {t === "overview" ? "Visão geral" :
                     t === "products" ? `Produtos (${data.products.length})` :
                     t === "timeline" ? `Timeline (${posts.length})` :
                     `Colaboradores (${data.collaborators.length})`}
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <div className="mt-4 space-y-4">
                  <Block title="Área de atuação">
                    <KV k="Categoria" v={data.partner.business_area || "—"} />
                    <KV k="Especialidade" v={data.partner.specialty || "—"} />
                  </Block>
                  {data.partner.description && (
                    <Block title="Biografia">
                      <p className="text-xs text-white/70 whitespace-pre-wrap">{data.partner.description}</p>
                    </Block>
                  )}
                  <Block title="Documento & contato">
                    {!readOnly && <KV k="CNPJ/CPF" v={data.partner.document || "—"} />}
                    <KV k="WhatsApp" v={data.partner.whatsapp || "—"} />
                    <KV k="Endereço" v={data.partner.address || "—"} />
                    <KV k="Cidade" v={`${data.partner.city || "—"}${data.partner.state ? "/" + data.partner.state : ""}`} />
                  </Block>
                  <Block title="Redes sociais">
                    <div className="flex flex-wrap gap-2">
                      <Social icon={Instagram} label={data.partner.instagram} href={data.partner.instagram ? (String(data.partner.instagram).startsWith("http") ? data.partner.instagram : `https://instagram.com/${String(data.partner.instagram).replace("@", "")}`) : null} />
                      <Social icon={Facebook} label={data.partner.facebook} href={data.partner.facebook} />
                      <Social icon={Globe} label={data.partner.website} href={data.partner.website} />
                      <Social icon={MessageCircle} label={data.partner.whatsapp} href={waUrl} />
                    </div>
                  </Block>
                </div>
              )}

              {tab === "products" && (
                <div className="mt-4 space-y-2">
                  {data.products.length === 0 && (
                    <p className="text-xs text-white/40 py-6 text-center">Nenhum produto cadastrado.</p>
                  )}
                  {data.products.map((p: any) => (
                    <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <div className="h-16 w-16 rounded bg-white/5 flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-white/30" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold truncate">{p.name}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${
                            p.kind === "free" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                          }`}>{p.kind === "free" ? "gratuito" : "pago"}</span>
                          {!readOnly && <StatusPill status={p.status} small />}
                        </div>
                        <p className="text-[11px] text-white/60 mt-0.5">
                          {p.kind === "free" ? "Brinde" : `R$ ${Number(p.price || 0).toFixed(2)}`}
                        </p>
                        {p.description && <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{p.description}</p>}
                        {p.kind === "free" && formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                            <Clock className="h-3 w-3" /> {formatBenefitWindow(p.benefit_start_time, p.benefit_end_time)}
                          </p>
                        )}
                        {!readOnly && p.admin_notes && p.status === "rejected" && (
                          <p className="text-[10px] text-red-300 mt-1">Obs.: {p.admin_notes}</p>
                        )}
                        {!readOnly && p.status === "pending" && (
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => handleProduct(p.id, "approved")} disabled={acting}
                              className="flex items-center gap-1 rounded bg-green-500 px-2.5 py-1 text-[11px] font-bold disabled:opacity-50">
                              <CheckCircle2 className="h-3 w-3" /> Aprovar
                            </button>
                            <button onClick={() => { setRejectFor(p.id); setReason(""); }} disabled={acting}
                              className="flex items-center gap-1 rounded bg-red-500/80 px-2.5 py-1 text-[11px] font-bold disabled:opacity-50">
                              <XCircle className="h-3 w-3" /> Rejeitar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "timeline" && (
                <div className="mt-4">
                  {posts.length === 0 ? (
                    <p className="text-xs text-white/40 py-8 text-center flex flex-col items-center gap-2">
                      <Camera className="h-5 w-5 text-white/30" />
                      Nenhuma foto publicada na timeline.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {posts.map((post) => (
                        <div key={post.id} className="relative aspect-square group">
                          <img src={post.image_url} alt={post.caption || ""} className="h-full w-full object-cover rounded" />
                          {post.caption && (
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center p-2 rounded">
                              <p className="text-[10px] text-white text-center line-clamp-4">{post.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "collaborators" && (
                <div className="mt-4 space-y-2">
                  {data.collaborators.length === 0 && (
                    <p className="text-xs text-white/40 py-6 text-center">Nenhum colaborador cadastrado.</p>
                  )}
                  {data.collaborators.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      {c.profiles?.photo_url ? (
                        <img src={c.profiles.photo_url} alt={c.profiles?.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs">{c.profiles?.name?.[0]?.toUpperCase() || "?"}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{c.profiles?.name || "—"}</p>
                        {!readOnly && (
                          <p className="text-[10px] text-white/40 truncate">{c.profiles?.email || c.profiles?.phone || ""}</p>
                        )}
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase font-bold">Colab.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {rejectFor && !readOnly && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3">
            <div className="w-full max-w-md rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold mb-3">Motivo da rejeição</h3>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
                className="w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-sm"
                placeholder="Explique o que precisa ser ajustado" />
              <div className="mt-3 flex gap-2">
                <button onClick={() => setRejectFor(null)} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm">Cancelar</button>
                <button
                  onClick={() => { if (!reason.trim()) return toast.error("Informe o motivo"); handleProduct(rejectFor, "rejected", reason); }}
                  className="flex-1 rounded bg-red-500 px-3 py-2 text-sm font-bold">Rejeitar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const cls =
    status === "approved" ? "bg-green-500/15 text-green-400" :
    status === "blocked" || status === "rejected" ? "bg-red-500/15 text-red-400" :
    "bg-yellow-500/15 text-yellow-400";
  const label =
    status === "approved" ? "Aprovado" :
    status === "blocked" ? "Bloqueado" :
    status === "rejected" ? "Rejeitado" : "Pendente";
  return <span className={`${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"} rounded ${cls}`}>{label}</span>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
      <Icon className="h-4 w-4 mx-auto text-primary" />
      <p className="mt-1 text-lg font-bold leading-none">{value}</p>
      <p className="text-[10px] text-white/40 mt-1">{label}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/50">{k}</span>
      <span className="text-white/90 text-right truncate ml-3">{v}</span>
    </div>
  );
}

function Social({ icon: Icon, label, href }: { icon: typeof Instagram; label: string | null; href: string | null }) {
  if (!label) return null;
  const inner = (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] hover:bg-white/10">
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer">{inner}</a> : inner;
}
