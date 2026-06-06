import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, MapPin, MessageCircle, Instagram, Facebook, Globe, Sparkles, Image as ImageIcon, Tag, Ticket, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CouponModal } from "@/components/student/CouponModal";


export const Route = createFileRoute("/student/partners/$partnerId")({
  head: () => ({ meta: [{ title: "Parceiro — FitMind Club" }] }),
  component: PartnerProfilePage,
});

interface Partner {
  id: string; fantasy_name: string; description: string | null; photo_url: string | null; cover_url: string | null;
  whatsapp: string | null; instagram: string | null; facebook: string | null; website: string | null;
  address: string | null; city: string | null; state: string | null;
}
interface Product { id: string; kind: "free" | "paid"; redemption_mode: "free" | "discount" | null; discount_percent: number | null; benefit_start_time: string | null; benefit_end_time: string | null; name: string; description: string | null; image_url: string | null; price: number; }
interface Post { id: string; image_url: string; caption: string | null; created_at: string; }

function formatBenefitWindow(start?: string | null, end?: string | null) {
  const fmt = (value?: string | null) => value ? value.slice(0, 5) : null;
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `Disponível das ${s} às ${e}`;
  if (s) return `Disponível a partir das ${s}`;
  if (e) return `Disponível até ${e}`;
  return null;
}

function PartnerProfilePage() {
  const { partnerId } = Route.useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "products" | "timeline">("info");
  const [productFilter, setProductFilter] = useState<"all" | "free" | "discount" | "paid">("all");

  const [coupon, setCoupon] = useState<{ token: string; productName: string; benefitWindow: string | null } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const generateCoupon = async (product: Product) => {
    setGenerating(product.id);
    const { data, error } = await supabase.rpc("student_generate_partner_coupon" as never, { p_partner_product_id: product.id } as never);
    setGenerating(null);
    if (error) { toast.error(error.message); return; }
    const rows = data as unknown as { coupon_id: string; token: string }[];
    if (!rows || rows.length === 0) { toast.error("Não foi possível gerar o cupom."); return; }
    setCoupon({ token: rows[0].token, productName: product.name, benefitWindow: formatBenefitWindow(product.benefit_start_time, product.benefit_end_time) });
  };


  useEffect(() => {
    (async () => {
      const [p, pr, ps] = await Promise.all([
        supabase.from("partners" as never).select("*").eq("id" as never, partnerId).eq("status" as never, "approved" as never).maybeSingle(),
        supabase.from("partner_products" as never).select("id,kind,redemption_mode,discount_percent,benefit_start_time,benefit_end_time,name,description,image_url,price").eq("partner_id" as never, partnerId).eq("status" as never, "approved" as never).eq("is_active_by_partner" as never, true as never).order("kind" as never),
        supabase.from("partner_posts" as never).select("*").eq("partner_id" as never, partnerId).order("created_at" as never, { ascending: false }).limit(30),
      ]);
      setPartner((p.data as unknown as Partner) || null);
      setProducts((pr.data as unknown as Product[]) || []);
      setPosts((ps.data as unknown as Post[]) || []);
      setLoading(false);
    })();
  }, [partnerId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!partner) return <div className="min-h-screen flex flex-col items-center justify-center text-white gap-3" style={{ backgroundColor: "#0A0A0A" }}><p>Parceiro não encontrado.</p><Link to="/student/partners" className="text-primary text-sm">Voltar</Link></div>;

  const waLink = partner.whatsapp ? `https://wa.me/55${partner.whatsapp.replace(/\D/g, "")}` : null;

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#0F0F0F] px-4 py-3">
        <Link to="/student/partners" className="text-white/60"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-base font-bold text-white truncate">{partner.fantasy_name}</h1>
      </div>

      {partner.cover_url && <img src={partner.cover_url} alt="" className="h-40 w-full object-cover" />}

      <div className="px-4 pt-4 flex items-center gap-3">
        {partner.photo_url ? <img src={partner.photo_url} className="h-20 w-20 rounded-2xl object-cover -mt-12 border-2 border-[#0A0A0A]" alt="" /> : <div className="h-20 w-20 rounded-2xl bg-white/5 flex items-center justify-center"><Building2 className="h-8 w-8 text-white/30" /></div>}
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white truncate">{partner.fantasy_name}</h2>
          {(partner.city || partner.state) && <p className="text-[11px] text-white/40 flex items-center gap-1"><MapPin className="h-3 w-3" /> {[partner.city, partner.state].filter(Boolean).join(" / ")}</p>}
        </div>
      </div>

      <div className="px-4 mt-3 flex gap-2 flex-wrap">
        {waLink && <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-green-500/20 text-green-400 text-xs px-3 py-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
        {partner.instagram && <a href={partner.instagram.startsWith("http") ? partner.instagram : `https://instagram.com/${partner.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-pink-500/20 text-pink-400 text-xs px-3 py-1.5"><Instagram className="h-3.5 w-3.5" /> Instagram</a>}
        {partner.facebook && <a href={partner.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 text-blue-400 text-xs px-3 py-1.5"><Facebook className="h-3.5 w-3.5" /> Facebook</a>}
        {partner.website && <a href={partner.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white text-xs px-3 py-1.5"><Globe className="h-3.5 w-3.5" /> Site</a>}
      </div>

      <div className="px-4 mt-4 flex gap-2 border-b border-white/10">
        {(["info", "products", "timeline"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`pb-2 px-2 text-xs font-bold ${tab === t ? "text-primary border-b-2 border-primary" : "text-white/50"}`}>
            {t === "info" ? "Sobre" : t === "products" ? `Produtos (${products.length})` : `Timeline (${posts.length})`}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {tab === "info" && (
          <div className="space-y-3 text-sm text-white/80">
            {partner.description ? <p className="whitespace-pre-wrap">{partner.description}</p> : <p className="text-white/40">Sem descrição.</p>}
            {partner.address && <p className="text-xs text-white/50">{partner.address}</p>}
          </div>
        )}

        {tab === "products" && (
          products.length === 0 ? <p className="text-center text-sm text-white/40 py-8">Sem produtos ativos.</p> : (
            <>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {([
                  { k: "all", label: `Todos (${products.length})` },
                  { k: "free", label: `Gratuitos (${products.filter(p => p.kind === "free" && (p.redemption_mode ?? "free") === "free").length})` },
                  { k: "discount", label: `Descontos (${products.filter(p => p.kind === "free" && p.redemption_mode === "discount").length})` },
                  { k: "paid", label: `Pagos (${products.filter(p => p.kind === "paid").length})` },
                ] as const).map((f) => (
                  <button
                    key={f.k}
                    onClick={() => setProductFilter(f.k)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${productFilter === f.k ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-white/60"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {products
                  .filter((p) => {
                    if (productFilter === "all") return true;
                    if (productFilter === "paid") return p.kind === "paid";
                    if (productFilter === "discount") return p.kind === "free" && p.redemption_mode === "discount";
                    return p.kind === "free" && (p.redemption_mode ?? "free") === "free";
                  })
                  .map((p) => {
                    const isDiscount = p.kind === "free" && p.redemption_mode === "discount";
                    const isFree = p.kind === "free" && !isDiscount;
                    return (
                      <div key={p.id} className="rounded-xl overflow-hidden flex flex-col relative" style={{ backgroundColor: "#1A1A1A" }}>
                        {isDiscount && p.discount_percent ? (
                          <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground text-[11px] font-extrabold px-2 py-1 rounded-md shadow-lg">
                            {p.discount_percent}% OFF
                          </div>
                        ) : null}
                        {p.image_url ? <img src={p.image_url} className="h-28 w-full object-cover" alt={p.name} /> : <div className="h-28 w-full bg-white/5 flex items-center justify-center"><Tag className="h-6 w-6 text-white/30" /></div>}
                        <div className="p-2.5 flex-1 flex flex-col">
                          <div className="flex items-center gap-1 mb-1">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${isDiscount ? "bg-amber-500/15 text-amber-400" : isFree ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>
                              {isDiscount ? <><Sparkles className="inline h-2.5 w-2.5" /> Desconto</> : isFree ? <><Sparkles className="inline h-2.5 w-2.5" /> Gratuito</> : "Patrocinado"}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white line-clamp-2">{p.name}</p>
                          {p.kind === "paid" && <p className="text-xs text-primary mt-1">R$ {Number(p.price).toFixed(2)}</p>}
                          {p.description && <p className="text-[10px] text-white/50 line-clamp-2 mt-1">{p.description}</p>}
                          {p.kind === "free" && formatBenefitWindow(p.benefit_start_time, p.benefit_end_time) && (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                              <Clock className="h-3 w-3" /> {formatBenefitWindow(p.benefit_start_time, p.benefit_end_time)}
                            </p>
                          )}
                          {p.kind === "free" && (
                            <button
                              onClick={() => generateCoupon(p)}
                              disabled={generating === p.id}
                              className="mt-2 inline-flex items-center justify-center gap-1 rounded bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                              {generating === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ticket className="h-3 w-3" />}
                              {isDiscount ? "Gerar cupom de desconto" : "Gerar cupom de resgate"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )
        )}


        {tab === "timeline" && (
          posts.length === 0 ? <p className="text-center text-sm text-white/40 py-8">Sem publicações.</p> : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => (
                <div key={post.id} className="aspect-square relative group">
                  <img src={post.image_url} alt={post.caption || ""} className="h-full w-full object-cover rounded" />
                  {post.caption && (
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center p-2 rounded">
                      <p className="text-[10px] text-white text-center line-clamp-4"><ImageIcon className="h-3 w-3 inline mr-1" />{post.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {coupon && <CouponModal coupon={coupon} onClose={() => setCoupon(null)} />}
    </div>
  );
}

