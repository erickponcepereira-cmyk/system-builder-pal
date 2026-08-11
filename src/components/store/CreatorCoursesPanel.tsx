import { useState } from "react";
import { AlertTriangle, BookOpen, GraduationCap, Megaphone, Users } from "lucide-react";

type Tab = "conteudo" | "alunos" | "provas" | "ofertas";

const TABS: Array<{ id: Tab; label: string; icon: typeof BookOpen }> = [
  { id: "conteudo", label: "Conteúdo", icon: BookOpen },
  { id: "alunos", label: "Alunos", icon: Users },
  { id: "provas", label: "Provas", icon: GraduationCap },
  { id: "ofertas", label: "Ofertas", icon: Megaphone },
];

/**
 * Painel do criador — superfície de teste.
 *
 * As quatro abas que parceiro e profissional vão usar para montar curso,
 * acompanhar quem estuda, aplicar prova e ligar ofertas.
 *
 * Ainda sem dados: o motor de aulas depende das tabelas propostas em
 * `docs/propostas/2026-08-11-motor-de-aulas.sql`. Enquanto elas não existirem,
 * cada aba diz o que vai mostrar em vez de fingir número — painel com dado
 * inventado é pior que painel vazio, porque ninguém sabe quando ficou real.
 */
export function CreatorCoursesPanel({ role }: { role: "partner" | "professional" }) {
  const [tab, setTab] = useState<Tab>("conteudo");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b>Painel de teste.</b> Estrutura em avaliação, visível apenas para master admin.
            Os dados entram quando o motor de aulas for aplicado no banco.
          </span>
        </p>
      </div>

      <header className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {role === "partner" ? "Parceiro" : "Profissional"}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Cursos</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Monte o conteúdo, acompanhe quem está estudando e libere certificado.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "conteudo" && (
        <Section
          title="Conteúdo"
          lines={[
            "Criar curso, módulo e aula, com vídeo, ebook e material anexo.",
            "Regra de liberação por aula: sempre, sequencial, por dias após a compra, ou data fixa.",
            "Chaves por arquivo: permitir baixar e exigir marca d'água do aluno.",
          ]}
          needs="digital_product_modules · digital_product_lessons"
        />
      )}

      {tab === "alunos" && (
        <Section
          title="Alunos"
          lines={[
            "Quem comprou, percentual assistido, em qual aula parou e quando entrou pela última vez.",
            "Quem está parado há mais de 10 dias — a lista que vira ligação.",
            "Em qual aula a turma trava, que é diagnóstico de conteúdo e não do aluno.",
          ]}
          needs="digital_lesson_progress"
          note="Mostra progresso e nome. CPF, telefone e endereço ficam fora por desenho."
        />
      )}

      {tab === "provas" && (
        <Section
          title="Provas e certificado"
          lines={[
            "Questões por módulo, nota mínima e número de tentativas.",
            "Certificado emitido na aprovação, com código consultável em página pública.",
            "Questão mais errada da turma, para revisar a aula correspondente.",
          ]}
          needs="tabelas de prova — ainda não propostas"
        />
      )}

      {tab === "ofertas" && (
        <Section
          title="Ofertas"
          lines={[
            "Produtos ligados ao curso e onde cada um aparece.",
            "Entrada da área, fim de módulo e aula não comprada.",
            "Dentro do player fica desligado e sem chave: é regra da casa.",
          ]}
          needs="reaproveita a vitrine já existente"
        />
      )}
    </div>
  );
}

function Section({
  title,
  lines,
  needs,
  note,
}: {
  title: string;
  lines: string[];
  needs: string;
  note?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <ul className="mt-3 space-y-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            {line}
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-3 rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        depende de: {needs}
      </p>
    </section>
  );
}

export default CreatorCoursesPanel;
