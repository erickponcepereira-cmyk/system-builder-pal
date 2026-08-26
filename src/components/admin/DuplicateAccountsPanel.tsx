import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Users, AlertTriangle, RefreshCw } from "lucide-react";
import { listDuplicateAccounts, type DuplicateAccountRow } from "@/lib/challenge-tickets-admin.functions";

/**
 * Lista cadastros repetidos (mesmo telefone ou CPF) e mostra onde está o histórico
 * de cada um, para o admin saber qual conta manter na hora de mesclar.
 */
export function DuplicateAccountsPanel() {
  const load = useServerFn(listDuplicateAccounts);
  const [rows, setRows] = useState<DuplicateAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const fetchRows = async () => {
    setLoading(true);
    try {
      setRows(await load(undefined as never));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar duplicados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visible = onlyOpen ? rows.filter(r => r.profiles.every(p => !p.mergedInto)) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Contas com o mesmo telefone ou CPF. Compras, tickets e inscrições podem estar separados entre elas —
          use a aba <b>Mesclar contas</b> para unificar, mantendo como destino a conta que a pessoa usa hoje.
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
            Só pendentes
          </label>
          <button onClick={fetchRows} className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !visible.length ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-5 w-5" /> Nenhum cadastro duplicado pendente.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(group => (
            <div key={`${group.keyKind}-${group.key}`} className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> {group.keyKind} {group.key}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.profiles.map(p => (
                  <div key={p.profileId} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    <p className="font-bold text-foreground">{p.name || "Sem nome"}</p>
                    <p className="text-muted-foreground">{p.email || "sem e-mail"}</p>
                    <p className="mt-1 text-muted-foreground">
                      {p.orders} compra(s) · {p.tickets} ticket(s) · {p.enrollments} inscrição(ões)
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Criada em {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}
                      {p.mergedInto ? " · já mesclada" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
