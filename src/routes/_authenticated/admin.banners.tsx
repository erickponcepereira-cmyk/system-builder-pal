import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  head: () => ({ meta: [{ title: "Banners da loja — Admin" }] }),
  component: BannersAdmin,
});

type Banner = {
  id: string;
  kind: "banner" | "popup";
  title: string;
  subtitle: string | null;
  badge: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

type Destino = { rotulo: string; url: string };

/** Destinos internos prontos, para ninguém precisar decorar caminho. */
const DESTINOS: Destino[] = [
  { rotulo: "Meus cursos", url: "/student/library" },
  { rotulo: "Loja", url: "/student/store" },
  { rotulo: "Gratuitos", url: "/student/freebies" },
  { rotulo: "Desafio", url: "/student/challenge" },
  { rotulo: "Carteirinha", url: "/student/card" },
  { rotulo: "Meu treino", url: "/student/workout" },
];

const vazio = (kind: "banner" | "popup"): Partial<Banner> => ({
  kind,
  title: "",
  subtitle: "",
  badge: "",
  link_url: "",
  link_label: "",
  is_active: true,
  sort_order: 0,
});

function BannersAdmin() {
  const [itens, setItens] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Partial<Banner> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoArte, setEnviandoArte] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("store_banners" as never)
      .select("*")
      .order("kind" as never)
      .order("sort_order" as never);
    if (error) toast.error(error.message);
    setItens((data as unknown as Banner[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    if (!editando?.title?.trim()) { toast.error("Dê um título ao banner."); return; }
    setSalvando(true);
    try {
      const payload = {
        kind: editando.kind || "banner",
        title: editando.title.trim(),
        subtitle: editando.subtitle?.trim() || null,
        badge: editando.badge?.trim() || null,
        image_url: editando.image_url || null,
        link_url: editando.link_url?.trim() || null,
        link_label: editando.link_label?.trim() || null,
        is_active: editando.is_active !== false,
        sort_order: Number(editando.sort_order || 0),
        starts_at: editando.starts_at || null,
        ends_at: editando.ends_at || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = editando.id
        ? await supabase.from("store_banners" as never).update(payload as never).eq("id" as never, editando.id as never)
        : await supabase.from("store_banners" as never).insert(payload as never);
      if (error) throw new Error(error.message);
      toast.success("Banner salvo.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (b: Banner) => {
    if (!window.confirm(`Excluir "${b.title}"?`)) return;
    const { error } = await supabase.from("store_banners" as never).delete().eq("id" as never, b.id as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído.");
    await carregar();
  };

  const enviarArte = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editando) return;
    setEnviandoArte(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `banners/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("store-images")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("store-images").getPublicUrl(path);
      setEditando({ ...editando, image_url: data.publicUrl });
      toast.success("Arte enviada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setEnviandoArte(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>;
  }

  const banners = itens.filter((i) => i.kind === "banner");
  const popups = itens.filter((i) => i.kind === "popup");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-white">
      <header className="mb-5">
        <h1 className="text-xl font-bold">Banners da loja</h1>
        <p className="mt-1 text-xs text-white/50">
          A faixa do topo gira, e cada visita começa num banner diferente — assim a pessoa
          conhece todos com o tempo. Sem nenhum banner ativo, a loja volta a destacar produto
          por regra (destaque, maior desconto, curso).
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditando(vazio("banner"))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-black">
          <Plus className="h-3.5 w-3.5" /> Novo banner
        </button>
        <button type="button" onClick={() => setEditando(vazio("popup"))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white">
          <Plus className="h-3.5 w-3.5" /> Novo popup
        </button>
      </div>

      {editando && (
        <div className="mb-5 rounded-2xl border border-primary/30 bg-white/5 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">
            {editando.id ? "Editando" : "Novo"} {editando.kind === "popup" ? "popup" : "banner"}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/70">
              Título *
              <input value={editando.title || ""} onChange={(e) => setEditando({ ...editando, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-white/70">
              Etiqueta <span className="text-white/40">(ex.: 50% OFF)</span>
              <input value={editando.badge || ""} onChange={(e) => setEditando({ ...editando, badge: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-white/70 sm:col-span-2">
              Subtítulo
              <input value={editando.subtitle || ""} onChange={(e) => setEditando({ ...editando, subtitle: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <div className="mt-3">
            <p className="text-xs text-white/70">Para onde leva</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DESTINOS.map((d) => (
                <button key={d.url} type="button"
                  onClick={() => setEditando({ ...editando, link_url: d.url, link_label: editando.link_label || d.rotulo })}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                    editando.link_url === d.url ? "bg-primary text-black" : "border border-white/15 text-white/70"
                  }`}>
                  {d.rotulo}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={editando.link_url || ""} onChange={(e) => setEditando({ ...editando, link_url: e.target.value })}
                placeholder="/student/store?produto=ID  ou  https://..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white" />
              <input value={editando.link_label || ""} onChange={(e) => setEditando({ ...editando, link_label: e.target.value })}
                placeholder="Texto do botão (popup)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white" />
            </div>
            <p className="mt-1 text-[10px] text-white/40">
              Para apontar a um produto: abra o produto na loja, copie o id e use
              /student/store?produto=&lt;id&gt;
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white">
              {enviandoArte ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {editando.image_url ? "Trocar arte" : "Enviar arte"}
              <input type="file" accept="image/*" className="hidden" onChange={enviarArte} />
            </label>
            {editando.image_url && (
              <img src={editando.image_url} alt="" className="h-12 w-20 rounded-lg object-cover" />
            )}
            <label className="inline-flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={editando.is_active !== false}
                onChange={(e) => setEditando({ ...editando, is_active: e.target.checked })} />
              Ativo
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-white/70">
              Ordem
              <input type="number" value={editando.sort_order ?? 0}
                onChange={(e) => setEditando({ ...editando, sort_order: Number(e.target.value) })}
                className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black disabled:opacity-60">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
            </button>
            <button type="button" onClick={() => setEditando(null)}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/70">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {[
        { titulo: "Faixa do topo", lista: banners, vazio: "Nenhum banner. A loja está destacando produto por regra." },
        { titulo: "Popup de entrada", lista: popups, vazio: "Nenhum popup. Cada pessoa vê um popup uma única vez." },
      ].map((grupo) => (
        <section key={grupo.titulo} className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-white/80">{grupo.titulo}</h2>
          {grupo.lista.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/40">{grupo.vazio}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {grupo.lista.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  {b.image_url ? (
                    <img src={b.image_url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-white/10">
                      <ImageIcon className="h-4 w-4 text-white/30" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {b.badge && <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-black">{b.badge}</span>}
                      {b.title}
                    </p>
                    <p className="truncate text-[11px] text-white/45">
                      {b.subtitle || "sem subtítulo"}
                      {b.link_url && <> · <ExternalLink className="inline h-2.5 w-2.5" /> {b.link_url}</>}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${b.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>
                    {b.is_active ? "ativo" : "off"}
                  </span>
                  <button type="button" onClick={() => setEditando(b)} className="shrink-0 text-[11px] font-bold text-primary">
                    Editar
                  </button>
                  <button type="button" onClick={() => excluir(b)} aria-label="Excluir" className="shrink-0">
                    <Trash2 className="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
