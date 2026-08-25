import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Clock, Eye, Loader2, Undo2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Aprovação de cursos.
 *
 * É o degrau que impede curso de terceiro entrar na vitrine sem ninguém ter
 * olhado. O criador leva de `draft` a `pending_review`; só daqui sai para
 * `active`, e `active` é o único status que a loja lê.
 *
 * A tela não repete a regra de permissão: `digital_products_admin_all` já dá
 * ao admin o que precisa, e as duas tabelas de autoria têm política de admin
 * própria. Checar papel aqui seria uma segunda verdade.
 */
export const Route = createFileRoute("/_authenticated/admin/cursos")({
  head: () => ({ meta: [{ title: "Cursos — Aprovação" }] }),
  component: AprovacaoDeCursos,
});

type CursoParaAprovar = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  status: string;
  criador: string;
  origem: "Parceiro" | "Profissional" | "FitMind";
  modulos: number;
  aulas: number;
  aulasSemArquivo: number;
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO: Record<string, string> = {
  draft: "Rascunho",
  pending_review: "Aguardando análise",
  active: "No ar",
  inactive: "Fora do ar",
};

function AprovacaoDeCursos() {
  const [cursos, setCursos] = useState<CursoParaAprovar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"fila" | "todos">("fila");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Traz os quatro status: a fila é o padrão, mas o admin precisa poder
      // achar um curso já no ar para tirar do ar.
      const { data: produtos, error } = await supabase
        .from("digital_products")
        .select("id,title,description,cover_url,price,status")
        .in("status", ["draft", "pending_review", "active", "inactive"])
        .order("title");
      if (error) throw new Error(error.message);

      const linhas = (produtos as Array<Record<string, unknown>>) || [];
      const ids = linhas.map((p) => String(p.id));
      if (!ids.length) { setCursos([]); return; }

      // Autoria: as duas tabelas, porque parceiro e profissional nasceram em
      // épocas diferentes e nunca foram unificadas.
      const [pcc, ccc, mods] = await Promise.all([
        supabase
          .from("partner_created_courses" as never)
          .select("digital_product_id,partners(fantasy_name)" as never)
          .in("digital_product_id" as never, ids as never),
        supabase
          .from("coach_created_courses" as never)
          .select("digital_product_id,coaches(profiles:profile_id(name))" as never)
          .in("digital_product_id" as never, ids as never),
        supabase
          .from("digital_product_modules" as never)
          .select("id,digital_product_id" as never)
          .in("digital_product_id" as never, ids as never),
      ]);

      type VinculoParceiro = {
        digital_product_id: string;
        partners: { fantasy_name: string | null } | null;
      };
      type VinculoCoach = {
        digital_product_id: string;
        coaches: { profiles: { name: string | null } | null } | null;
      };

      const autor = new Map<string, { nome: string; origem: CursoParaAprovar["origem"] }>();
      for (const r of ((pcc.data as unknown as VinculoParceiro[]) || [])) {
        autor.set(String(r.digital_product_id), {
          nome: r.partners?.fantasy_name || "Parceiro",
          origem: "Parceiro",
        });
      }
      // Parceiro ganha do coach quando os dois vínculos existirem: é a empresa
      // que fatura, e é o nome dela que o admin precisa ver na fila.
      for (const r of ((ccc.data as unknown as VinculoCoach[]) || [])) {
        if (autor.has(String(r.digital_product_id))) continue;
        autor.set(String(r.digital_product_id), {
          nome: r.coaches?.profiles?.name || "Profissional",
          origem: "Profissional",
        });
      }

      const modulosPorCurso = new Map<string, string[]>();
      for (const m of ((mods.data as unknown as Array<Record<string, unknown>>) || [])) {
        const cid = String(m.digital_product_id);
        modulosPorCurso.set(cid, [...(modulosPorCurso.get(cid) || []), String(m.id)]);
      }

      // Aulas: o número que decide se dá para aprovar. Curso com aula sem
      // arquivo publicado é curso que o aluno abre e não vê nada.
      const todosModulos = Array.from(modulosPorCurso.values()).flat();
      const porModulo = new Map<string, { total: number; semArquivo: number }>();
      if (todosModulos.length) {
        const { data: aulas } = await supabase
          .from("digital_product_lessons" as never)
          .select("module_id,kind,video_key,file_path" as never)
          .in("module_id" as never, todosModulos as never);
        for (const l of ((aulas as unknown as Array<Record<string, unknown>>) || [])) {
          const mid = String(l.module_id);
          const atual = porModulo.get(mid) || { total: 0, semArquivo: 0 };
          const temArquivo = l.kind === "live"
            ? true
            : l.kind === "video" ? !!l.video_key : !!l.file_path;
          porModulo.set(mid, {
            total: atual.total + 1,
            semArquivo: atual.semArquivo + (temArquivo ? 0 : 1),
          });
        }
      }

      setCursos(linhas.map((p) => {
        const id = String(p.id);
        const meus = modulosPorCurso.get(id) || [];
        const contas = meus.reduce(
          (acc, mid) => {
            const c = porModulo.get(mid) || { total: 0, semArquivo: 0 };
            return { total: acc.total + c.total, semArquivo: acc.semArquivo + c.semArquivo };
          },
          { total: 0, semArquivo: 0 },
        );
        const a = autor.get(id);
        return {
          id,
          title: String(p.title || ""),
          description: (p.description as string) || null,
          coverUrl: (p.cover_url as string) || null,
          price: Number(p.price || 0),
          status: String(p.status || ""),
          criador: a?.nome ?? "FitMind",
          origem: a?.origem ?? "FitMind",
          modulos: meus.length,
          aulas: contas.total,
          aulasSemArquivo: contas.semArquivo,
        };
      }));
    } catch (e) {
      console.error("[admin cursos]", e);
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const mudarStatus = async (curso: CursoParaAprovar, novo: string, aviso: string) => {
    setOcupado(curso.id);
    try {
      const { error } = await supabase
        .from("digital_products")
        .update({ status: novo })
        .eq("id", curso.id);
      if (error) throw new Error(error.message);

      // O vínculo de autoria também guarda a aprovação. Marcar só o produto
      // deixaria as duas metades discordando sobre o mesmo fato.
      if (curso.origem !== "FitMind") {
        const tabela = curso.origem === "Parceiro"
          ? "partner_created_courses"
          : "coach_created_courses";
        await supabase
          .from(tabela as never)
          .update({
            approved_by_admin: novo === "active",
            approved_at: novo === "active" ? new Date().toISOString() : null,
          } as never)
          .eq("digital_product_id" as never, curso.id as never);
      }

      toast.success(aviso);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  };

  const naFila = cursos.filter((c) => c.status === "pending_review");
  const lista = filtro === "fila" ? naFila : cursos;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-bold text-foreground">Cursos</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Curso de parceiro e de profissional só entra na loja depois de aprovado aqui. A loja
          lê apenas o status <b>No ar</b>.
        </p>
      </header>

      <div className="mb-4 flex rounded-lg bg-muted p-0.5">
        {([["fila", `Na fila (${naFila.length})`], ["todos", `Todos (${cursos.length})`]] as const).map(
          ([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              aria-pressed={filtro === id}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition ${
                filtro === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {rotulo}
            </button>
          ),
        )}
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm font-bold text-foreground">
            {filtro === "fila" ? "Nada esperando análise" : "Nenhum curso ainda"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((c) => (
            <article key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {c.coverUrl
                    ? <img src={c.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <BookOpen className="h-5 w-5 text-muted-foreground opacity-50" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-foreground">{c.title}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.status === "active"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : c.status === "pending_review"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {ROTULO[c.status] || c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.origem} · {c.criador} · {fmt(c.price)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {c.modulos} {c.modulos === 1 ? "módulo" : "módulos"} · {c.aulas}{" "}
                    {c.aulas === 1 ? "aula" : "aulas"}
                  </p>

                  {/* O aviso que evita aprovar curso vazio: a checagem é por
                      arquivo publicado, não por aula existir. */}
                  {c.aulasSemArquivo > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-500">
                      {c.aulasSemArquivo}{" "}
                      {c.aulasSemArquivo === 1 ? "aula sem arquivo publicado" : "aulas sem arquivo publicado"}
                    </p>
                  )}
                  {c.aulas === 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-destructive">
                      Sem aulas. Aprovar coloca um curso vazio na loja.
                    </p>
                  )}
                </div>
              </div>

              {c.description && (
                <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                  {c.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {c.status !== "active" && (
                  <button
                    type="button"
                    disabled={ocupado !== null || c.aulas === 0}
                    title={c.aulas === 0 ? "Curso sem aulas não pode ir para a loja." : undefined}
                    onClick={() => void mudarStatus(c, "active", "Curso publicado na loja.")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {ocupado === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Aprovar e publicar
                  </button>
                )}

                {c.status === "pending_review" && (
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => void mudarStatus(c, "draft", "Devolvido para o criador ajustar.")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground disabled:opacity-60"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Devolver para ajuste
                  </button>
                )}

                {c.status === "active" && (
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => {
                      if (!window.confirm(
                        `Tirar "${c.title}" da loja?\n\nQuem já comprou continua com acesso — só deixa de ser vendido.`,
                      )) return;
                      void mudarStatus(c, "inactive", "Curso fora da loja.");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Tirar da loja
                  </button>
                )}

                {c.status === "draft" && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    O criador ainda não enviou
                  </span>
                )}

                <a
                  href={`/student/curso/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver como aluno
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
