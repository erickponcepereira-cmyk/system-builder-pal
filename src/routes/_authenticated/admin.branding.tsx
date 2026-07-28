import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Palette, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StoreImageUpload } from "@/components/admin/StoreImageUpload";
import { limparCacheTemas } from "@/lib/branding";
import {
  assignBrandTheme,
  deleteBrandTheme,
  listAdminBrandThemes,
  saveBrandTheme,
  searchBrandTargets,
  type AlvoMarca,
  type TemaMarcaInput,
} from "@/lib/admin-branding.functions";

export const Route = createFileRoute("/_authenticated/admin/branding")({
  head: () => ({
    meta: [
      { title: "Identidade Visual — Admin FitMind Club" },
      { name: "description", content: "Crie temas de marca e vincule a coaches e parceiros sem alterar código." },
    ],
  }),
  component: AdminBranding,
});

const CAMPOS: Array<{ campo: keyof TemaMarcaInput; label: string }> = [
  { campo: "background", label: "Fundo" },
  { campo: "foreground", label: "Texto" },
  { campo: "card", label: "Cartão" },
  { campo: "card_foreground", label: "Texto do cartão" },
  { campo: "popover", label: "Popover" },
  { campo: "popover_foreground", label: "Texto do popover" },
  { campo: "primary_color", label: "Primária" },
  { campo: "primary_foreground", label: "Texto sobre primária" },
  { campo: "secondary", label: "Secundária" },
  { campo: "secondary_foreground", label: "Texto secundário" },
  { campo: "muted", label: "Neutro" },
  { campo: "muted_foreground", label: "Texto neutro" },
  { campo: "accent", label: "Destaque" },
  { campo: "accent_foreground", label: "Texto do destaque" },
  { campo: "border", label: "Borda" },
  { campo: "input", label: "Campo de formulário" },
  { campo: "ring", label: "Foco" },
  { campo: "sidebar", label: "Menu lateral" },
  { campo: "sidebar_foreground", label: "Texto do menu" },
  { campo: "sidebar_primary", label: "Primária do menu" },
  { campo: "sidebar_primary_foreground", label: "Texto primário do menu" },
  { campo: "sidebar_accent", label: "Destaque do menu" },
  { campo: "sidebar_accent_foreground", label: "Texto do destaque do menu" },
  { campo: "sidebar_border", label: "Borda do menu" },
  { campo: "sidebar_ring", label: "Foco do menu" },
];

const NOVO: TemaMarcaInput = {
  key: "",
  nome: "",
  mode: "dark",
  logo_full_url: null,
  logo_icon_url: null,
  favicon_url: null,
  theme_color: "#0B0707",
  background: "#0B0707",
  foreground: "#FFFFFF",
  card: "#161212",
  card_foreground: "#FFFFFF",
  popover: "#161212",
  popover_foreground: "#FFFFFF",
  primary_color: "#FF4A3D",
  primary_foreground: "#FFFFFF",
  secondary: "#1F1B1B",
  secondary_foreground: "#FFFFFF",
  muted: "#1F1B1B",
  muted_foreground: "#B7B7B7",
  accent: "#3A1512",
  accent_foreground: "#FF8A80",
  border: "#2A2323",
  input: "#1F1B1B",
  ring: "#FF4A3D",
  sidebar: "#0F0B0B",
  sidebar_foreground: "#FFFFFF",
  sidebar_primary: "#FF4A3D",
  sidebar_primary_foreground: "#FFFFFF",
  sidebar_accent: "#1F1B1B",
  sidebar_accent_foreground: "#FFFFFF",
  sidebar_border: "#2A2323",
  sidebar_ring: "#FF4A3D",
};

function AdminBranding() {
  const listFn = useServerFn(listAdminBrandThemes);
  const saveFn = useServerFn(saveBrandTheme);
  const delFn = useServerFn(deleteBrandTheme);
  const searchFn = useServerFn(searchBrandTargets);
  const assignFn = useServerFn(assignBrandTheme);

  const [temas, setTemas] = useState<TemaMarcaInput[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [edicao, setEdicao] = useState<TemaMarcaInput | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState("");
  const [alvos, setAlvos] = useState<AlvoMarca[]>([]);
  const [buscando, setBuscando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listFn({ data: undefined });
      setTemas(r.temas);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível carregar os temas.");
    } finally {
      setCarregando(false);
    }
  }, [listFn]);

  const buscarAlvos = useCallback(async (q: string) => {
    setBuscando(true);
    try {
      const r = await searchFn({ data: { q } });
      setAlvos(r.alvos);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível buscar.");
    } finally {
      setBuscando(false);
    }
  }, [searchFn]);

  useEffect(() => { carregar(); buscarAlvos(""); }, [carregar, buscarAlvos]);

  const salvar = async () => {
    if (!edicao) return;
    setSalvando(true);
    try {
      await saveFn({ data: edicao });
      limparCacheTemas();
      toast.success("Tema salvo. Já vale para quem estiver vinculado.");
      setEdicao(null);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar tema.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (key: string) => {
    if (!confirm(`Remover o tema "${key}"? Quem estava vinculado volta ao tema FitMind.`)) return;
    try {
      await delFn({ data: { key } });
      limparCacheTemas();
      toast.success("Tema removido.");
      carregar();
      buscarAlvos(busca);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover.");
    }
  };

  const vincular = async (alvo: AlvoMarca, key: string) => {
    try {
      await assignFn({ data: { kind: alvo.kind, id: alvo.id, key: key || null } });
      limparCacheTemas();
      setAlvos((prev) => prev.map((a) => (a.id === alvo.id && a.kind === alvo.kind ? { ...a, temaKey: key === "fitmind" ? null : key } : a)));
      toast.success("Identidade visual atualizada.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao vincular tema.");
    }
  };

  const opcoes = useMemo(() => [{ key: "fitmind", nome: "FitMind (padrão)" }, ...temas.filter((t) => t.key !== "fitmind")], [temas]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" /> Identidade visual
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie o tema de um parceiro ou coach (cores e logo) e vincule ao perfil dele. Quem é aluno desse coach passa a
          ver as mesmas cores. Sem tema vinculado, o app segue no FitMind escuro.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Temas cadastrados</h2>
          <button
            onClick={() => setEdicao({ ...NOVO })}
            className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Novo tema
          </button>
        </div>

        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {temas.map((t) => (
              <div key={t.key} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-8 w-8 rounded-full border border-border shrink-0" style={{ backgroundColor: t.primary_color }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{t.nome}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.key} · {t.mode === "light" ? "claro" : "escuro"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEdicao({ ...t })} className="text-xs rounded bg-muted px-2 py-1 text-foreground">Editar</button>
                  {t.key !== "fitmind" && (
                    <button onClick={() => remover(t.key)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {edicao && (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <h2 className="font-semibold text-foreground">{temas.some((t) => t.key === edicao.key) ? "Editar tema" : "Novo tema"}</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Nome exibido">
              <input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground" />
            </Campo>
            <Campo label="Identificador (sem espaços)">
              <input
                value={edicao.key}
                disabled={temas.some((t) => t.key === edicao.key)}
                onChange={(e) => setEdicao({ ...edicao, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground disabled:opacity-60"
              />
            </Campo>
            <Campo label="Modo">
              <select value={edicao.mode} onChange={(e) => setEdicao({ ...edicao, mode: e.target.value as "dark" | "light" })} className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground">
                <option value="dark">Escuro</option>
                <option value="light">Claro</option>
              </select>
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Logo completa">
              <StoreImageUpload value={edicao.logo_full_url} folder="branding" onChange={(url) => setEdicao({ ...edicao, logo_full_url: url })} />
            </Campo>
            <Campo label="Ícone / logo quadrada">
              <StoreImageUpload value={edicao.logo_icon_url} folder="branding" onChange={(url) => setEdicao({ ...edicao, logo_icon_url: url, favicon_url: edicao.favicon_url || url })} />
            </Campo>
            <Campo label="Cor da barra do navegador">
              <CorInput value={edicao.theme_color} onChange={(v) => setEdicao({ ...edicao, theme_color: v })} />
            </Campo>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS.map(({ campo, label }) => (
              <Campo key={campo} label={label}>
                <CorInput value={(edicao[campo] as string) || "#000000"} onChange={(v) => setEdicao({ ...edicao, [campo]: v })} />
              </Campo>
            ))}
          </div>

          <div className="rounded-xl p-4 border border-border" style={{ backgroundColor: edicao.background, color: edicao.foreground }}>
            <p className="text-sm font-semibold">Prévia — {edicao.nome || "sem nome"}</p>
            <div className="mt-2 rounded-lg p-3" style={{ backgroundColor: edicao.card, color: edicao.card_foreground }}>
              <p className="text-xs">Cartão de conteúdo</p>
              <span className="mt-2 inline-block rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: edicao.primary_color, color: edicao.primary_foreground }}>
                Botão principal
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando || !edicao.key || !edicao.nome} className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar tema
            </button>
            <button onClick={() => setEdicao(null)} className="rounded-lg bg-muted px-4 py-2 text-sm text-foreground">Cancelar</button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-foreground">Vincular a coach ou parceiro</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buscarAlvos(busca); }}
              placeholder="nome ou e-mail"
              className="w-full rounded-lg bg-input border border-border pl-9 pr-3 py-2 text-sm text-foreground"
            />
          </div>
          <button onClick={() => buscarAlvos(busca)} className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">Buscar</button>
        </div>

        {buscando ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : alvos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum coach ou parceiro encontrado.</p>
        ) : (
          <div className="space-y-2">
            {alvos.map((a) => (
              <div key={`${a.kind}-${a.id}`} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{a.nome}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.email} · {a.kind === "coach" ? "Coach" : "Parceiro"}</p>
                </div>
                <select
                  value={a.temaKey || "fitmind"}
                  onChange={(e) => vincular(a, e.target.value)}
                  className="rounded-lg bg-input border border-border px-2 py-1.5 text-xs text-foreground"
                >
                  {opcoes.map((o) => (
                    <option key={o.key} value={o.key}>{o.nome}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border border-border bg-transparent" />
      <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded-lg bg-input border border-border px-2 py-1.5 text-xs text-foreground" />
    </div>
  );
}
