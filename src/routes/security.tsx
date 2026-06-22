import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Database, KeyRound, Mail, FileText } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Segurança & Privacidade — FitMind Club" },
      { name: "description", content: "Como o FitMind Club protege seus dados, gerencia acesso e responde a incidentes." },
      { property: "og:title", content: "Segurança & Privacidade — FitMind Club" },
      { property: "og:description", content: "Como o FitMind Club protege seus dados, gerencia acesso e responde a incidentes." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Segurança & Privacidade</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">
          Esta página é mantida pelo time do FitMind Club para responder às perguntas mais comuns sobre
          segurança, privacidade e tratamento de dados na plataforma. Ela descreve controles atualmente
          ativos e práticas operacionais — não é uma certificação independente.
        </p>

        <Section icon={<Lock />} title="Autenticação e acesso">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Login via e-mail/senha e Google OAuth.</li>
            <li>Senhas verificadas contra a base pública Have I Been Pwned no cadastro e na troca.</li>
            <li>Sessões assinadas com JWT; tokens armazenados no navegador do usuário.</li>
            <li>Papéis (admin, coach, profissional, parceiro, aluno) controlados no servidor.</li>
          </ul>
        </Section>

        <Section icon={<Database />} title="Dados e armazenamento">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Banco PostgreSQL gerenciado, protegido por Row-Level Security em todas as tabelas com dados de usuários.</li>
            <li>Colunas sensíveis (PIX, dados bancários, CPF, endereço) não são expostas a visitantes anônimos.</li>
            <li>Backups automáticos diários gerenciados pela infraestrutura.</li>
            <li>Mídia (fotos, avatares, comprovantes) servida via URLs assinadas ou buckets segmentados.</li>
          </ul>
        </Section>

        <Section icon={<KeyRound />} title="Segregação de privilégios">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Promoção a administrador exige ação do admin máster e é registrada em log de auditoria.</li>
            <li>Operações financeiras críticas (saques, repasses, aprovações) só podem ser executadas por administradores autenticados.</li>
            <li>Triggers de banco bloqueiam alterações de campos protegidos (papel, status, comissões, rede MLM) por usuários comuns.</li>
          </ul>
        </Section>

        <Section icon={<Mail />} title="Privacidade e dados pessoais">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Coletamos apenas os dados necessários para operar a conta, processar pagamentos e ofertar treinos/produtos.</li>
            <li>Você pode solicitar acesso, correção ou exclusão dos seus dados pelo suporte.</li>
            <li>Compartilhamentos com terceiros se restringem a provedores de pagamento e infraestrutura.</li>
          </ul>
        </Section>

        <Section icon={<FileText />} title="Documentos">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li><Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link></li>
            <li><Link to="/termos" className="text-primary hover:underline">Termos de Uso</Link></li>
            <li><Link to="/termos-compra" className="text-primary hover:underline">Termos de Compra</Link></li>
          </ul>
        </Section>

        <Section icon={<ShieldCheck />} title="Contato de segurança">
          <p className="text-sm">
            Para reportar uma vulnerabilidade ou incidente de segurança, envie um e-mail ao time do
            FitMind Club através do canal de suporte do app. Investigamos todos os relatos recebidos e
            damos retorno em até 5 dias úteis.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}
