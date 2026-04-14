import { Zap, Shield, BarChart3, Smartphone, Users2, Wallet } from "lucide-react";

const features = [
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Comissões Automáticas",
    desc: "Sistema MLM com distribuição em cadeia. Cada venda gera comissões para toda a upline automaticamente.",
  },
  {
    icon: <Users2 className="h-6 w-6" />,
    title: "Rede de Indicações",
    desc: "Alunos viram coaches ao indicar. A rede cresce organicamente e todos ganham.",
  },
  {
    icon: <Wallet className="h-6 w-6" />,
    title: "Carteira Digital",
    desc: "Saldo em tempo real, histórico de comissões e saques rápidos direto pelo app.",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "Relatórios Completos",
    desc: "Dashboards com métricas de vendas, retenção, faturamento e desempenho de coaches.",
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: "Controle Total",
    desc: "Painel admin com gestão de coaches, produtos, pagamentos e configurações da plataforma.",
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: "Mobile First",
    desc: "Interface otimizada para celular. Coaches e alunos acessam tudo na palma da mão.",
  },
];

export function FeaturesSection() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Tudo que você precisa para <span className="text-gradient-primary">escalar</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Uma plataforma completa para gerenciar desafios fitness, rede de coaches e finanças.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
