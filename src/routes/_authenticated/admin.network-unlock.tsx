import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Sparkles, Clock } from "lucide-react";

const TIERS: Array<{ range: string; points: number; description: string }> = [
  { range: "Nível 1 a 9", points: 50, description: "Fase inicial — desenvolvimento e primeiras vendas" },
  { range: "Nível 10 a 14", points: 100, description: "Fase de resultados e liderança" },
  { range: "Nível 15 a 18", points: 150, description: "Fase de expansão — grandes organizações" },
  { range: "Nível 19 a 21", points: 100, description: "Fase de legado" },
];

function RouteComponent() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Liberação da Rede (Meta de Pontos)</h1>
        <p className="text-sm text-white/50 mt-1">
          A liberação das comissões de rede segue o mesmo motor de pontos usado para viagens/prêmios.
          Cada venda credita pontos automaticamente para o coach vendedor; a meta mensal depende da
          patente atual na <strong>Ordem dos Construtores</strong>.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-4">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Trophy className="h-4 w-4" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Metas por patente</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {TIERS.map((t) => (
            <div key={t.range} className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-[10px] uppercase text-white/40 font-bold">{t.range}</p>
              <p className="text-2xl font-bold text-white mt-1">{t.points} pts <span className="text-xs text-white/50 font-normal">/ mês</span></p>
              <p className="text-xs text-white/60 mt-1">{t.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3 text-xs text-white/75">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Como os pontos são gerados</h3>
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Toda venda paga (produtos da loja, parceiros, profissionais, cursos) já credita pontos ao coach vendedor em <code className="text-primary">coach_points_log</code> — o mesmo motor que alimenta as premiações de viagem e jantar.</li>
          <li>A quantidade de pontos por venda é calculada a partir da taxa de sistema do produto (1 ponto a cada R$2, arredondado para baixo).</li>
          <li>Para liberar as comissões da rede, o coach precisa somar no mês a quantidade mínima de pontos correspondente à sua patente.</li>
        </ul>
        <div className="flex items-center gap-2 pt-2 text-white">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Reset mensal</h3>
        </div>
        <p>
          Os pontos são contados por mês calendário. No dia 1º de cada mês às 3h (horário do servidor),
          um snapshot fecha o mês anterior e o novo período começa do zero automaticamente. Sem atingir a
          meta, as comissões da rede daquele mês ficam bloqueadas.
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/network-unlock")({
  head: () => ({ meta: [{ title: "Liberação da Rede — Admin" }] }),
  component: RouteComponent,
});
