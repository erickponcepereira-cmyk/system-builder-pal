import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import {
  PERMISSOES,
  ROTULOS_PERMISSAO,
  type Permissao,
  type Unidade,
} from "@/lib/unidades-parceiro";
import { addPartnerMemberByEmail, listPartnerTeam } from "@/lib/partner-members.functions";

interface Membro {
  id: string;
  profileId: string;
  papel: "owner" | "manager" | "staff";
  permissoes: string[];
  nome: string;
  email: string;
  perfis: string[];
  desde: string;
}

interface UnidadeEquipe {
  partnerId: string;
  fantasyName: string;
  membros: Membro[];
}

export function PartnerMembersPanel({ unidade }: { unidade: Unidade }) {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<UnidadeEquipe[]>([]);
  const [todas, setTodas] = useState(false);
  const [email, setEmail] = useState("");
  const [convidando, setConvidando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPartnerTeam({ data: { partnerId: unidade.partnerId, todas } });
      setGrupos((res.unidades as UnidadeEquipe[]) || []);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar a equipe.");
    } finally {
      setLoading(false);
    }
  }, [unidade.partnerId, todas]);

  useEffect(() => { carregar(); }, [carregar]);

  const convidar = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;
    setConvidando(true);
    try {
      const res = await addPartnerMemberByEmail({
        data: { partnerId: unidade.partnerId, email: alvo },
      });
      setEmail("");
      toast.success(`${res.name || alvo} adicionado à unidade.`);
      carregar();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível adicionar o membro.");
    } finally {
      setConvidando(false);
    }
  };

  const aplicarLocal = (id: string, patch: Partial<Membro>) =>
    setGrupos((prev) => prev.map((g) => ({ ...g, membros: g.membros.map((m) => (m.id === id ? { ...m, ...patch } : m)) })));

  const salvarPermissoes = async (m: Membro, novas: string[]) => {
    if (m.papel === "owner") return;
    setSalvando(m.id);
    const { error } = await supabase
      .from("partner_members" as never)
      .update({ permissoes: novas } as never)
      .eq("id" as never, m.id as never);
    setSalvando(null);
    if (error) { toast.error(error.message); return; }
    aplicarLocal(m.id, { permissoes: novas });
    setSalvo(m.id);
    setTimeout(() => setSalvo((v) => (v === m.id ? null : v)), 1800);
  };

  const alternar = (m: Membro, permissao: Permissao) =>
    salvarPermissoes(
      m,
      m.permissoes.includes(permissao)
        ? m.permissoes.filter((p) => p !== permissao)
        : [...m.permissoes, permissao],
    );

  const mudarPapel = async (m: Membro, papel: "manager" | "staff") => {
    if (m.papel === "owner") return;
    const { error } = await supabase
      .from("partner_members" as never)
      .update({ papel } as never)
      .eq("id" as never, m.id as never);
    if (error) { toast.error(error.message); return; }
    aplicarLocal(m.id, { papel });
  };

  const remover = async (m: Membro) => {
    if (m.papel === "owner") { toast.error("O dono da unidade não pode ser removido."); return; }
    if (!confirm(`Remover ${m.nome} desta unidade?`)) return;
    const { error } = await supabase.from("partner_members" as never).delete().eq("id" as never, m.id as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Membro removido.");
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="text-white font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Equipe de {unidade.fantasyName}</h2>
        <p className="text-xs text-white/50 mt-1">
          Adicione a recepção ou o gerente desta unidade e libere exatamente as abas que cada um pode acessar.
          O dono tem acesso total e não pode ser alterado aqui.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail da pessoa já cadastrada"
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          <button
            onClick={convidar}
            disabled={convidando || !email.trim()}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium inline-flex items-center gap-1 disabled:opacity-50"
          >
            {convidando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Adicionar
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <Chip active={!todas} onClick={() => setTodas(false)}>Só esta unidade</Chip>
          <Chip active={todas} onClick={() => setTodas(true)}>Todas as minhas unidades</Chip>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : grupos.every((g) => g.membros.length === 0) ? (
        <p className="text-sm text-white/40 text-center py-8">Nenhum membro por aqui ainda.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.partnerId} className="space-y-3">
            {todas && (
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">
                {g.fantasyName} · {g.membros.length} pessoa{g.membros.length === 1 ? "" : "s"}
              </h3>
            )}
            {g.membros.map((m) => (
              <div key={m.id} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-white text-sm">{m.nome}</p>
                    <p className="text-[11px] text-white/40">{m.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.perfis.map((p) => (
                        <span key={p} className="text-[10px] rounded bg-white/5 text-white/60 px-1.5 py-0.5">{p}</span>
                      ))}
                      <span className="text-[10px] rounded bg-white/5 text-white/40 px-1.5 py-0.5">
                        desde {new Date(m.desde).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.papel === "owner" ? (
                      <span className="text-[11px] rounded bg-primary/15 text-primary px-2 py-1 font-semibold">Dono</span>
                    ) : (
                      <>
                        <select
                          value={m.papel}
                          onChange={(e) => mudarPapel(m, e.target.value as "manager" | "staff")}
                          className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                        >
                          <option value="manager">Gerente</option>
                          <option value="staff">Equipe</option>
                        </select>
                        <button onClick={() => remover(m)} className="text-white/40 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>

                {m.papel === "owner" ? (
                  <p className="mt-3 text-xs text-white/40">Acesso total a todas as abas desta unidade.</p>
                ) : (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] font-semibold text-white/60">
                        Abas liberadas · {m.permissoes.length} de {PERMISSOES.length}
                        {salvando === m.id && <span className="ml-2 text-white/40">salvando…</span>}
                        {salvo === m.id && <span className="ml-2 text-emerald-400 inline-flex items-center gap-1"><Check className="h-3 w-3" /> salvo</span>}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => salvarPermissoes(m, [...PERMISSOES])} className="text-[11px] rounded bg-white/5 px-2 py-1 text-white/70 hover:bg-white/10">Marcar todas</button>
                        <button onClick={() => salvarPermissoes(m, [])} className="text-[11px] rounded bg-white/5 px-2 py-1 text-white/70 hover:bg-white/10">Limpar</button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {PERMISSOES.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.permissoes.includes(p)}
                            disabled={salvando === m.id}
                            onChange={() => alternar(m, p)}
                            className="h-4 w-4 accent-[var(--primary)]"
                          />
                          {ROTULOS_PERMISSAO[p]}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}
