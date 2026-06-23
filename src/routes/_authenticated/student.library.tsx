import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Lock, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/library")({
  component: StudentLibrary,
});

interface Purchase {
  id: string;
  purchased_at: string | null;
  expires_at: string | null;
  access_url: string | null;
  digital_products: {
    title: string;
    description: string | null;
    instructor: string | null;
    duration_hours: number | null;
    cover_url: string | null;
  } | null;
}

function StudentLibrary() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return setLoading(false);
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: student } = profile?.id ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle() : { data: null };
      if (!student?.id) return setLoading(false);
      const { data } = await supabase
        .from("digital_purchases")
        .select("id,purchased_at,expires_at,access_url,digital_products!digital_purchases_digital_product_id_fkey(title,description,instructor,duration_hours,cover_url)")
        .eq("student_id", student.id)
        .order("purchased_at", { ascending: false });
      setPurchases((data as unknown as Purchase[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Área do aluno</p>
        <h1 className="text-2xl font-bold text-foreground">Meus cursos</h1>
      </header>

      <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6" />
          <div><p className="text-base font-bold">Biblioteca digital</p><p className="text-xs opacity-80">Conteúdos liberados após confirmação do pagamento</p></div>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : purchases.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-bold text-foreground">Nenhum curso liberado</p>
          <p className="mt-1 text-xs text-muted-foreground">Compre um produto digital na loja e aguarde a confirmação do pagamento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((purchase) => {
            const expired = purchase.expires_at ? new Date(purchase.expires_at) < new Date() : false;
            return (
              <div key={purchase.id} className="rounded-2xl bg-card p-4">
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15"><PlayCircle className="h-6 w-6 text-primary" /></div>
                  <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-foreground">{purchase.digital_products?.title || "Curso FitMind"}</h2><p className="line-clamp-2 text-xs text-muted-foreground">{purchase.digital_products?.description || "Conteúdo digital liberado."}</p></div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{purchase.digital_products?.instructor || "FitMind Club"}</span><span>•</span><span>{purchase.digital_products?.duration_hours || 0}h</span><span>•</span><span>{expired ? "Acesso expirado" : `Até ${purchase.expires_at ? new Date(purchase.expires_at).toLocaleDateString("pt-BR") : "sem expiração"}`}</span></div>
                <a href={expired ? undefined : purchase.access_url || "#"} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${expired ? "pointer-events-none bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
                  <ExternalLink className="h-4 w-4" /> Acessar conteúdo
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}