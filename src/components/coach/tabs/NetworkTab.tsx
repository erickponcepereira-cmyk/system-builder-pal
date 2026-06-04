import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MinhaRede } from "@/components/coach/MinhaRede";
import { useServerFn } from "@tanstack/react-start";
import { getMyNetworkStructure, type StudentBreakdown } from "@/lib/network-ranking.functions";

const emptyBreakdown: StudentBreakdown = { total: 0, studentOnly: 0, coachStudent: 0, professionalStudent: 0, partnerStudent: 0 };

export function NetworkTab({ referralLink: _referralLink, onCopy: _onCopy }: { referralLink: string; onCopy: () => void }) {
  const [loading, setLoading] = useState(true);
  const [directs, setDirects] = useState<StudentBreakdown>(emptyBreakdown);
  const [network, setNetwork] = useState(0);
  const fetchNetwork = useServerFn(getMyNetworkStructure);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchNetwork();
        if (cancelled) return;
        setDirects(data.me?.directStudents ?? emptyBreakdown);
        setNetwork(data.totals.downlineCoaches);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Minha Rede</h1>
        <p className="text-sm text-white/50">Acompanhe sua rede MLM e simule ganhos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Alunos diretos</p>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          ) : (
            <div>
              <p className="text-3xl font-bold text-white">{directs.total}</p>
              <p className="mt-1 text-[10px] text-white/45">{directs.studentOnly} aluno · {directs.coachStudent} coach/aluno · {directs.professionalStudent} profissional/aluno · {directs.partnerStudent} parceiro/aluno</p>
            </div>
          )}
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Rede total de coaches</p>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          ) : (
            <p className="text-3xl font-bold text-white">{network}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <MinhaRede />
      </div>
    </>
  );
}

export default NetworkTab;
