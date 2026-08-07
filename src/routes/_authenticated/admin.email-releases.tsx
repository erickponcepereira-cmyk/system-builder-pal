import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, MailCheck, Loader2, RefreshCw, KeyRound, Link2, Copy, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import {
  listUnconfirmedUsers,
  confirmUserEmailByUserId,
  adminSetTemporaryPassword,
  adminSearchAuthUsers,
  adminGenerateRecoveryLink,
  adminSendRecoveryEmail,
  type UnconfirmedUserRow,
  type AuthUserRow,
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

      <PasswordLinkSection />
    </>
  );
}

function PasswordLinkSection() {
  const searchFn = useServerFn(adminSearchAuthUsers);
  const linkFn = useServerFn(adminGenerateRecoveryLink);
  const sendFn = useServerFn(adminSendRecoveryEmail);

  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<AuthUserRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (term.trim().length < 2) { toast.error("Digite ao menos 2 caracteres."); return; }
    setSearching(true);
    try {
      const res = await searchFn({ data: { search: term.trim() } });
      setRows(res.rows);
      if (!res.rows.length) toast.info("Nenhuma conta encontrada.");
    } catch (err) {
      toast.error((err as Error)?.message || "Falha na busca");
    } finally {
      setSearching(false);
    }
  };

  const generate = async (row: AuthUserRow) => {
    setBusy(row.userId);
    try {
      const res = await linkFn({ data: { email: row.email } });
      setLinks((cur) => ({ ...cur, [row.userId]: res.url }));
      try { await navigator.clipboard.writeText(res.url); toast.success("Link gerado e copiado!"); }
      catch { toast.success("Link gerado."); }
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao gerar link");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copiado!"); }
    catch { toast.error("Não foi possível copiar. Selecione o link manualmente."); }
  };

  const whatsapp = (row: AuthUserRow, url: string) => {
    const msg = `Olá${row.name ? ` ${row.name.split(" ")[0]}` : ""}! Aqui está seu link para criar uma nova senha no FitMind Club:\n\n${url}\n\nO link é de uso único e expira em cerca de 1 hora.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const resend = async (row: AuthUserRow) => {
    setBusy(row.userId);
    try {
      await sendFn({ data: { email: row.email } });
      toast.success("E-mail de redefinição reenviado.");
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao reenviar e-mail");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">Link de redefinição de senha</h2>
        <p className="text-sm text-white/50">
          Busque qualquer conta e gere um link pronto para enviar ao cliente por WhatsApp — sem depender do e-mail.
        </p>
      </div>

      <form onSubmit={doSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="E-mail ou nome do cliente..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
        </button>
      </form>

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.userId} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white">{r.name || "(sem perfil)"}</div>
                  <div className="text-[11px] text-white/50 break-all">{r.email}</div>
                  <div className="mt-1 text-[11px] text-white/40">
                    {r.role || "sem papel"} • {r.provider} • {r.emailConfirmed ? "e-mail confirmado" : "e-mail não confirmado"}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    onClick={() => resend(r)}
                    disabled={busy === r.userId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" /> Reenviar e-mail
                  </button>
                  <button
                    onClick={() => generate(r)}
                    disabled={busy === r.userId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
                  >
                    {busy === r.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Gerar link
                  </button>
                </div>
              </div>

              {links[r.userId] && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="mb-2 text-[11px] text-white/40">
                    Uso único • expira em cerca de 1 hora. Envie agora para o cliente.
                  </p>
                  <p className="break-all text-[11px] text-white/70">{links[r.userId]}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => copy(links[r.userId]!)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-white/10"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <button
                      onClick={() => whatsapp(r, links[r.userId]!)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/25"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="rounded-2xl border border-white/5 p-6 text-center text-sm text-white/50" style={{ backgroundColor: "#1A1A1A" }}>
          Nenhuma conta encontrada para essa busca.
        </p>
      )}
    </div>
  );
}

