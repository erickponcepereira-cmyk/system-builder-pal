import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, Loader2, PlayCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { listMyCourses, type CourseSummary } from "@/lib/course-engine";

/**
 * "Meus cursos" do aluno.
 *
 * Substitui a versão anterior, que listava `digital_purchases` e cujo único
 * botão abria `access_url` em outra aba — o conteúdo era consumido fora do app,
 * sem progresso e sem retorno.
 *
 * A lista sai da RLS: `digital_product_modules` só devolve curso que a pessoa
 * pode ver. Comprado, incluso na mensalidade do coach, ou administrado por ela.
 */
export function MyCourses() {
  const [cursos, setCursos] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (vivo) setLoading(false); return; }

        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        const { data: student } = profile?.id
          ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
          : { data: null };

        const lista = await listMyCourses((student as { id?: string } | null)?.id ?? null);
        if (vivo) setCursos(lista);
      } catch (error) {
        // Falha de rede ou de permissão virava o mesmo estado vazio de
        // "você não tem curso" — indistinguível de não ter curso nenhum. Foi
        // exatamente esse silêncio que escondeu o incidente dos gratuitos.
        console.error("[meus-cursos]", error);
        if (vivo) setFalhou(true);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Área do aluno</p>
        <h1 className="text-2xl font-bold text-foreground">Meus cursos</h1>
      </header>

      {falhou ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-bold text-destructive">Não conseguimos carregar seus cursos</p>
          <p className="mt-1 text-xs leading-relaxed text-destructive/80">
            Foi uma falha ao buscar, não uma lista vazia. Atualize a tela; se continuar, avise a
            gente.
          </p>
        </div>
      ) : cursos.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm font-bold text-foreground">Nenhum curso liberado</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Cursos comprados na loja aparecem aqui assim que o pagamento é confirmado.
          </p>
          <Link
            to="/student/store"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
          >
            Ver cursos na loja
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cursos.map((c) => (
            <Link
              key={c.productId}
              to="/student/curso/$id"
              params={{ id: c.productId }}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors hover:bg-accent"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {c.coverUrl ? (
                  <img src={c.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <PlayCircle className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{c.title}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {c.totalAulas === 0
                    ? "Conteúdo em preparação"
                    : c.feitas === 0
                      ? c.totalAulas + (c.totalAulas === 1 ? " aula" : " aulas")
                      : c.feitas + " de " + c.totalAulas + " aulas"}
                </p>
                {c.totalAulas > 0 && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: c.percentual + "%" }} />
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {c.totalAulas > 0 ? c.percentual + "%" : ""}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyCourses;
