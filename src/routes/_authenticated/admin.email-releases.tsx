import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, MailCheck, Loader2, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  listUnconfirmedUsers,
  confirmUserEmailByUserId,
  adminSetTemporaryPassword,
  type UnconfirmedUserRow,
} from "@/lib/admin-email-releases.functions";

export const Route = createFileRoute("/_authenticated/admin/email-releases")({
  head: () => ({
    meta: [
      { title: "Liberar Acesso por E-mail — Admin FitMind Club" },
      { name: "description", content: "Confirme manualmente e-mails de contas que não conseguiram confirmar." },
    ],
  }),
  component: AdminEmailReleases,
});

function AdminEmailReleases() {
  const listFn = useServerFn(listUnconfirmedUsers);
  const confirmFn = useServerFn(confirmUserEmailByUserId);
  const tempPassFn = useServerFn(adminSetTemporaryPassword);

  const [rows, setRows] = useState<UnconfirmedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: {} });
      setRows(res.rows);
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao carregar contas");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirm = async (row: UnconfirmedUserRow) => {
    setBusyId(row.userId);
    try {
      await confirmFn({ data: { userId: row.userId } });
      toast.success(`E-mail de ${row.email} confirmado. O acesso já está liberado.`);
      setRows((cur) => cur.filter((r) => r.userId !== row.userId));
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao confirmar e-mail");
    } finally {
      setBusyId(null);
    }
  };

  const setTempPassword = async (row: UnconfirmedUserRow) => {
    const pwd = window.prompt(
      `Definir senha temporária para ${row.email}.\nMínimo 8 caracteres. A pessoa será obrigada a trocar no próximo login.`,
      "Fitmind@2026",
    );
    if (!pwd) return;
    if (pwd.length < 8) { toast.error("A senha precisa ter no mínimo 8 caracteres."); return; }
    setBusyId(row.userId);
    try {
      await tempPassFn({ data: { userId: row.userId, password: pwd } });
      toast.success("Senha temporária definida e e-mail confirmado.");
      setRows((cur) => cur.filter((r) => r.userId !== row.userId));
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao definir senha");
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.email.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q))
    : rows;

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Liberar acesso (e-mail não confirmado)</h1>
          <p className="text-sm text-white/50">
            Contas criadas que ainda não confirmaram o e-mail. Confirme manualmente para liberar o login.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
          style={{ backgroundColor: "#1A1A1A" }}
        />
      </div>

      <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-white/50">
            Nenhuma conta pendente de confirmação. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-[11px] uppercase text-white/50">
                <tr>
                  <th className="p-3">Conta</th>
                  <th className="p-3 hidden sm:table-cell">Papel</th>
                  <th className="p-3 hidden md:table-cell">Origem</th>
                  <th className="p-3 hidden md:table-cell">Criado em</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.userId} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium text-white">{r.name || "(sem perfil)"}</div>
                      <div className="text-[11px] text-white/50">{r.email}</div>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-white/70">{r.role || "—"}</td>
                    <td className="p-3 hidden md:table-cell text-white/60">{r.provider}</td>
                    <td className="p-3 hidden md:table-cell text-white/60">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setTempPassword(r)}
                          disabled={busyId === r.userId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
                          title="Definir senha temporária"
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Senha temporária
                        </button>
                        <button
                          onClick={() => confirm(r)}
                          disabled={busyId === r.userId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
                        >
                          {busyId === r.userId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MailCheck className="h-3.5 w-3.5" />
                          )}
                          Confirmar e-mail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-white/40">{filtered.length} conta(s) pendente(s).</p>
    </>
  );
}
