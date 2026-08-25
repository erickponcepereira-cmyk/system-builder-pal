import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dumbbell, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { AcademiaTestePanel } from "@/components/partner/AcademiaTestePanel";
import { carregarUnidades, lembrarUnidadeAtiva, unidadeLembrada, type Unidade } from "@/lib/unidades-parceiro";

export const Route = createFileRoute("/_authenticated/academia")({
  head: () => ({ meta: [{ title: "Academia — FitMind Club" }] }),
  component: PainelAcademia,
});

/**
 * Painel da academia, fora do painel de parceiro.
 *
 * Nasceu como aba "Academia (teste)" dentro de Parceiro, atrás do gate de
 * master admin. Quem toca uma academia não é a mesma pessoa que cuida de
 * produto, carteira e comissão do parceiro — misturar as duas coisas obrigava
 * a recepção a atravessar um painel inteiro que não é dela.
 *
 * Quem enxerga: qualquer dono ou membro de uma unidade que tenha controle de
 * acesso configurado (`partner_acesso_config`). É isso que "academia ativa"
 * quer dizer aqui — não é flag nova, é a configuração que já existe quando a
 * catraca foi montada.
 */
function PainelAcademia() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [academias, setAcademias] = useState<Unidade[]>([]);
  const [ativa, setAtiva] = useState<Unidade | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { void navigate({ to: "/login" }); return; }
        const { data: perfil } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        if (!perfil?.id || !vivo) return;

        const unidades = await carregarUnidades(perfil.id);
        if (unidades.length === 0) { if (vivo) setAcademias([]); return; }

        // Só as unidades que têm controle de acesso montado. A flag vem da RPC
        // (SECURITY DEFINER) e não de uma consulta direta a
        // partner_acesso_config: política de RLS que devolve vazio não dá erro,
        // só faz a academia sumir da tela sem explicação.
        const lista = unidades.filter((u) => u.temAcademia);
        if (!vivo) return;
        setAcademias(lista);

        const lembrada = unidadeLembrada();
        setAtiva(lista.find((u) => u.partnerId === lembrada) ?? lista[0] ?? null);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [navigate]);

  const trocar = (u: Unidade) => {
    setAtiva(u);
    lembrarUnidadeAtiva(u.partnerId);
  };

  const sair = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/login" });
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0B]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 px-4 py-3"
        style={{
          backgroundColor: "#141414",
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Logo className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{ativa?.fantasyName ?? "Academia"}</p>
            <p className="text-[10px] opacity-60">Controle de acesso e alunos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher current="academia" />
          <button
            onClick={() => void sair()}
            aria-label="Sair"
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {academias.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 px-4 py-2" style={{ backgroundColor: "#141414" }}>
          {academias.map((u) => (
            <button
              key={u.partnerId}
              onClick={() => trocar(u)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                u.partnerId === ativa?.partnerId
                  ? "bg-primary text-black"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {u.fantasyName}
            </button>
          ))}
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 py-4">
        {academias.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <Dumbbell className="h-10 w-10 text-white/20" />
            <p className="text-sm font-semibold">Nenhuma academia ligada a este login.</p>
            <p className="max-w-sm text-xs text-white/50">
              O painel aparece depois que a unidade tem o controle de acesso configurado.
              Fale com quem cuida da conta da academia.
            </p>
          </div>
        ) : ativa ? (
          <AcademiaTestePanel partnerId={ativa.partnerId} />
        ) : null}
      </main>
    </div>
  );
}
