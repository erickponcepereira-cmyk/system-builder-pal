import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ShoppingBag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StudentPurchaseHistory } from "@/components/student/StudentPurchaseHistory";

export const Route = createFileRoute("/_authenticated/student/compras")({
  component: StudentComprasPage,
});

function StudentComprasPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile) { setLoading(false); return; }
      const { data: student } = await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle();
      setStudentId(student?.id || null);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B0707" }}>
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0B0707]/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/student" className="rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-base font-bold text-white">
              <ShoppingBag className="h-4 w-4" /> Minhas compras
            </h1>
            <p className="text-[11px] text-white/50">Histórico unificado: loja FitMind, parceiros e profissionais.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-white/60"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !studentId ? (
          <p className="rounded-xl border border-white/5 bg-white/5 p-6 text-center text-sm text-white/60">
            Cadastro de aluno ainda não finalizado.
          </p>
        ) : (
          <StudentPurchaseHistory studentId={studentId} />
        )}
      </main>
    </div>
  );
}
