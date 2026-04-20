import { createFileRoute } from "@tanstack/react-router";
import { Users, Send, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/student/group")({
  component: GroupPage,
});

const messages = [
  { id: 1, name: "Coach Marina", text: "Bom dia turma! 🔥 Hoje tem HIIT às 19h, não percam!", time: "08:32", isCoach: true },
  { id: 2, name: "Carlos S.", text: "Bora! Já bati a meta de água ✅", time: "08:45" },
  { id: 3, name: "Você", text: "Animado pra aula de hoje 💪", time: "09:10", isMine: true },
  { id: 4, name: "Patrícia M.", text: "Alguém tem dica de receita low carb pro almoço?", time: "11:24" },
  { id: 5, name: "Coach Marina", text: "Vou postar 3 receitas no canal de receitas em 1h ✨", time: "11:30", isCoach: true },
];

function GroupPage() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/5" style={{ backgroundColor: "rgba(15,15,15,0.95)", backdropFilter: "blur(20px)" }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Grupo Desafio 30 Dias</p>
          <p className="text-[11px] text-white/40">42 participantes • 1 coach online</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
              m.isMine
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "rounded-bl-sm"
            }`} style={!m.isMine ? { backgroundColor: "#1A1A1A" } : undefined}>
              {!m.isMine && (
                <p className={`text-[11px] font-bold mb-0.5 ${m.isCoach ? "text-primary" : "text-white/60"}`}>
                  {m.name} {m.isCoach && "• Coach"}
                </p>
              )}
              <p className={`text-sm ${m.isMine ? "text-primary-foreground" : "text-white"}`}>{m.text}</p>
              <p className={`text-[9px] mt-1 ${m.isMine ? "text-primary-foreground/60" : "text-white/30"}`}>{m.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 py-3 border-t border-white/5" style={{ backgroundColor: "rgba(15,15,15,0.95)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2 rounded-full pl-4 pr-2 py-1.5" style={{ backgroundColor: "#1A1A1A" }}>
          <button className="text-white/40 hover:text-white/70">
            <ImageIcon className="h-5 w-5" />
          </button>
          <input
            placeholder="Mensagem..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none py-2"
          />
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
            <Send className="h-4 w-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
