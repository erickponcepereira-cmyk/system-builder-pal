import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, HelpCircle, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappUrl } from "@/lib/whatsapp";

export const Route = createFileRoute("/student/support")({ component: StudentSupportPage });

type Admin = { name: string; role: string; match: string; phone: string };

function StudentSupportPage() {
  const [admins, setAdmins] = useState<Admin[]>([
    { name: "Erick Ponce Pereira", role: "Administrador — Gestor de Software", match: "erick ponce", phone: "" },
    { name: "Nathan Utuari", role: "Administrador — Fundador", match: "nathan utuari", phone: "" },
  ]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("name,phone,role")
        .or("name.ilike.%erick ponce%,name.ilike.%nathan utuari%")
        .not("phone", "is", null);
      const rows = (data as Array<{ name: string; phone: string | null }>) || [];
      setAdmins((prev) =>
        prev.map((a) => {
          const found = rows.find((r) => (r.name || "").toLowerCase().includes(a.match) && r.phone);
          return { ...a, phone: found?.phone || "" };
        }),
      );
    })();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ChevronLeft className="h-5 w-5 text-white" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Atendimento</p>
          <h1 className="text-2xl font-bold text-white">Central de ajuda</h1>
        </div>
      </header>

      <section className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Converse com nossos administradores</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              Fale diretamente com a administração da FitMind Club pelo WhatsApp.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {admins.map((admin) => {
          const url = whatsappUrl(admin.phone, `Olá ${admin.name.split(" ")[0]}, sou aluno da FitMind Club e preciso de ajuda.`);
          return (
            <div key={admin.match} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <p className="text-sm font-bold text-white">{admin.name}</p>
              <p className="mt-0.5 text-[11px] text-white/50">{admin.role}</p>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white"
                >
                  <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                </a>
              ) : (
                <p className="mt-3 text-center text-[11px] text-white/40">Contato indisponível no momento.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
