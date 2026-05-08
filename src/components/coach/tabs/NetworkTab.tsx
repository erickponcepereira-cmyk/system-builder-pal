import { ArrowUpRight } from "lucide-react";
import { MinhaRede } from "@/components/coach/MinhaRede";
import { RankingTable } from "@/components/coach/RankingTable";

export function NetworkTab({ referralLink: _referralLink, onCopy: _onCopy }: { referralLink: string; onCopy: () => void }) {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Minha Rede</h1>
        <p className="text-sm text-white/50">Acompanhe sua rede MLM e simule ganhos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Alunos diretos</p>
          <p className="text-3xl font-bold text-white">24</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +3 este mês
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Rede total (3 níveis)</p>
          <p className="text-3xl font-bold text-white">187</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +24 este mês
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <MinhaRede />
      </div>

      <div className="mt-4">
        <RankingTable />
      </div>
    </>
  );
}

export default NetworkTab;
