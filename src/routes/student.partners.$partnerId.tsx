import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, MapPin, MessageCircle, Instagram, Facebook, Globe, Sparkles, Image as ImageIcon, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/partners/$partnerId")({
  head: () => ({ meta: [{ title: "Parceiro — FitMind Club" }] }),
  component: PartnerProfilePage,
});

interface Partner {
  id: string; fantasy_name: string; description: string | null; photo_url: string | null; cover_url: string | null;
  whatsapp: string | null; instagram: string | null; facebook: string | null; website: string | null;
  address: string | null; city: string | null; state: string | null;
}
interface Product { id: string; kind: "free" | "paid"; name: string; description: string | null; image_url: string | null; price: number; }
interface Post { id: string; image_url: string; caption: string | null; created_at: string; }

function PartnerProfilePage() {
  const { partnerId } = Route.useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "products" | "timeline">("info");

  useEffect(() => {
    (async () => {
      const [p, pr, ps] = await Promise.all([
        supabase.from("partners" as never).select("*").eq("id" as never, partnerId).eq("status" as never, "approved" as never).maybeSingle(),
        supabase.from("partner_products" as never).select("id,kind,name,description,image_url,price").eq("partner_id" as never, partnerId).eq("status" as never, "approved" as never).eq("is_active_by_partner" as never, true as never).order("kind" as never),
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
            <div className="grid grid-cols-2 gap-3">
              {products.map((p) => (
                <div key={p.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
                  {p.image_url ? <img src={p.image_url} className="h-28 w-full object-cover" alt={p.name} /> : <div className="h-28 w-full bg-white/5 flex items-center justify-center"><Tag className="h-6 w-6 text-white/30" /></div>}
                  <div className="p-2.5">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.kind === "free" ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>
                        {p.kind === "free" ? <><Sparkles className="inline h-2.5 w-2.5" /> Grátis</> : "Patrocinado"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white line-clamp-2">{p.name}</p>
                    {p.kind === "paid" && <p className="text-xs text-primary mt-1">R$ {Number(p.price).toFixed(2)}</p>}
                    {p.description && <p className="text-[10px] text-white/50 line-clamp-2 mt-1">{p.description}</p>}
                  </div>
                </div>
              ))}
            </div>
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
    </div>
  );
}
