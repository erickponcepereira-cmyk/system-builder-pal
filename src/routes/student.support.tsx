import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, HelpCircle, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/support")({ component: StudentSupportPage });

type Settings = { support_whatsapp: string; support_email: string };

function StudentSupportPage() {
  const [settings, setSettings] = useState<Settings>({ support_whatsapp: "", support_email: "suporte@fitmindclub.com" });
  const [subject, setSubject] = useState("Dúvida sobre meu desafio");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key,value").in("key", ["support_whatsapp", "support_email"]);
      const loaded = { support_whatsapp: "", support_email: "suporte@fitmindclub.com" };
      ((data as Array<{ key: string; value: string | null }>) || []).forEach((item) => {
        if (item.key === "support_whatsapp") loaded.support_whatsapp = item.value || "";
        if (item.key === "support_email") loaded.support_email = item.value || loaded.support_email;
      });
      setSettings(loaded);
    })();
  }, []);

  const supportText = encodeURIComponent(`${subject}\n\n${message || "Olá, preciso de ajuda com minha conta FitMind Club."}`);
  const cleanPhone = settings.support_whatsapp.replace(/\D/g, "");
  const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${supportText}` : `https://wa.me/?text=${supportText}`;
  const mailUrl = `mailto:${settings.support_email}?subject=${encodeURIComponent(subject)}&body=${supportText}`;

  const copyProtocol = async () => {
    await navigator.clipboard.writeText(`FitMind Club | ${subject} | ${message}`);
    toast.success("Mensagem copiada");
  };

  return <div className="flex flex-col gap-4 p-4 pb-6">
    <header className="flex items-center gap-3 pt-2">
      <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5"><ChevronLeft className="h-5 w-5 text-white" /></Link>
      <div><p className="text-xs uppercase tracking-wider text-white/40">Atendimento</p><h1 className="text-2xl font-bold text-white">Central de ajuda</h1></div>
    </header>

    <section className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><HelpCircle className="h-6 w-6" /></div>
        <div><h2 className="text-base font-bold text-white">Suporte FitMind Club</h2><p className="mt-1 text-xs leading-relaxed text-white/60">Envie sua dúvida para o canal oficial configurado pelo administrador.</p></div>
      </div>
    </section>

    <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold text-white">Abrir atendimento</h2></div>
      <div className="space-y-3">
        <select value={subject} onChange={(event) => setSubject(event.target.value)} className="field-control">
          <option>Dúvida sobre meu desafio</option>
          <option>Pagamento ou pedido</option>
          <option>Indicações e carteira</option>
          <option>Curso Quero ser Coach</option>
          <option>Problema técnico</option>
        </select>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="Descreva o que aconteceu" className="field-control" />
        <div className="grid grid-cols-2 gap-2">
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          <a href={mailUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white"><Mail className="h-4 w-4" /> E-mail</a>
        </div>
        <Button onClick={copyProtocol} variant="outline" className="w-full gap-2 border-white/10 text-white/70"><Send className="h-4 w-4" /> Copiar mensagem</Button>
      </div>
    </section>

    <section className="grid gap-2">
      {[
        ["Resposta", "O time responde pelo canal escolhido."],
        ["Pagamentos", "Tenha número do pedido ou comprovante em mãos."],
        ["Privacidade", "Nunca envie senhas ou códigos de acesso."],
      ].map(([title, text]) => <div key={title} className="rounded-2xl bg-white/5 p-4"><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-xs text-white/50">{text}</p></div>)}
    </section>
  </div>;
}
