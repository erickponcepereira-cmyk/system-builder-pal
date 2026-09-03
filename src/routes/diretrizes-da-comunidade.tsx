import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, Flag, HeartHandshake, Scale, ShieldAlert } from "lucide-react";
import { COMMUNITY_POLICY_VERSION } from "@/lib/ugc.constants";

export const Route = createFileRoute("/diretrizes-da-comunidade")({
  head: () => ({
    meta: [
      { title: "Diretrizes da Comunidade — FitMind Club" },
      { name: "description", content: "Regras de convivência, denúncia, bloqueio e moderação da comunidade FitMind Club." },
    ],
  }),
  component: CommunityGuidelinesPage,
});

function CommunityGuidelinesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-8 flex items-center gap-3">
          <ShieldAlert className="h-9 w-9 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Diretrizes da Comunidade</h1>
            <p className="text-xs text-muted-foreground">Versão {COMMUNITY_POLICY_VERSION} — vigente desde 29 de agosto de 2026</p>
          </div>
        </div>

        <p className="mb-8 text-sm leading-6 text-muted-foreground">
          O FitMind Club reúne alunos, coaches, profissionais e parceiros. Estas regras se aplicam a mensagens,
          imagens, perfis, timelines, avaliações de produtos, respostas de vendedores, grupos externos divulgados no app
          e qualquer outro conteúdo publicado por usuários.
        </p>

        <Section icon={<HeartHandshake />} title="Convivência esperada">
          <p>Trate as pessoas com respeito, publique apenas conteúdo verdadeiro e relacionado à finalidade da comunidade e preserve a privacidade de terceiros.</p>
        </Section>

        <Section icon={<Ban />} title="Conteúdo proibido">
          <ul className="list-disc space-y-1 pl-5">
            <li>assédio, bullying, perseguição, ameaça ou incentivo à violência;</li>
            <li>ódio ou discriminação por raça, origem, religião, gênero, orientação sexual, deficiência ou outra característica protegida;</li>
            <li>nudez, conteúdo sexual, exploração sexual ou qualquer sexualização de menores;</li>
            <li>automutilação, suicídio ou práticas perigosas apresentadas de forma incentivadora;</li>
            <li>fraude, spam, falsidade ideológica, malware, venda ilegal ou links enganosos;</li>
            <li>dados pessoais, imagens ou informações confidenciais de terceiros sem autorização;</li>
            <li>conteúdo ilegal, violação de direitos autorais ou instruções para cometer atos ilícitos.</li>
          </ul>
        </Section>

        <Section icon={<HeartHandshake />} title="Avaliações e respostas de vendedores">
          <p>
            Avaliações devem relatar uma experiência real de compra, sem recompensa condicionada, manipulação de nota,
            spam ou ataques pessoais. Vendedores podem responder para esclarecer ou resolver a experiência, sempre com
            respeito e sem divulgar dados do comprador. Tanto a avaliação quanto a resposta podem ser denunciadas,
            bloqueadas quando houver uma pessoa ou empresa responsável e removidas após análise.
          </p>
        </Section>

        <Section icon={<Flag />} title="Denunciar e bloquear">
          <p>
            Use o menu de segurança ao lado de uma mensagem, publicação, avaliação, resposta de vendedor, perfil ou grupo
            para denunciar. A denúncia é confidencial e cria uma cópia controlada do conteúdo para análise. Você também
            pode bloquear participantes, profissionais, parceiros ou grupos; o conteúdo bloqueado deixa de aparecer para
            sua conta. Consulte e reverta seus bloqueios na Central de Segurança do app.
          </p>
        </Section>

        <Section icon={<Scale />} title="Análise, medidas e recurso">
          <p>
            A equipe pode advertir, ocultar mensagens, publicações ou avaliações, remover respostas de vendedores,
            silenciar ou banir de grupos, suspender publicações, desativar grupos e bloquear parceiros. Consideramos
            contexto, gravidade e reincidência. A pessoa afetada verá a medida em sua Central de Segurança e poderá
            apresentar um recurso. Quando aceito, a medida é revogada e a decisão fica registrada.
          </p>
        </Section>

        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <h2 className="mb-2 font-semibold">Risco imediato</h2>
          <p>
            Se houver ameaça imediata à vida ou segurança, não dependa apenas da denúncia no app: procure os serviços de
            emergência e as autoridades locais. A ferramenta do FitMind Club não substitui atendimento emergencial.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link to="/termos" className="text-primary hover:underline">Termos de Uso</Link>
          <Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>
          <Link to="/security" className="text-primary hover:underline">Segurança e Privacidade</Link>
        </div>
      </div>
    </main>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-6 text-sm leading-6">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

