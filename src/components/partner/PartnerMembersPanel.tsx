import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, ShieldCheck } from "lucide-react";
import {
  PERMISSOES,
  ROTULOS_PERMISSAO,
  type Permissao,
  type Unidade,
} from "@/lib/unidades-parceiro";
import { addPartnerMemberByEmail } from "@/lib/partner-members.functions";


interface Membro {
  id: string;
  profile_id: string;
  papel: "owner" | "manager" | "staff";
  permissoes: string[];
  nome: string;
  email: string;
}

export function PartnerMembersPanel({ unidade }: { unidade: Unidade }) {
  const [loading, setLoading] = useState(true);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [email, setEmail] = useState("");
  const [convidando, setConvidando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("partner_members" as never)
      .select("id, profile_id, papel, permissoes" as never)
      .eq("partner_id" as never, unidade.partnerId as never);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const linhas = (data as unknown as Array<{ id: string; profile_id: string; papel: Membro["papel"]; permissoes: string[] | null }>) || [];
    const ids = linhas.map((l) => l.profile_id);
    const { data: perfis } = ids.length
      ? await supabase.from("profiles").select("id, name, email").in("id", ids)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null }> };

    const mapa = new Map((perfis || []).map((p) => [p.id, p]));
    setMembros(
      linhas.map((l) => ({
        id: l.id,
        profile_id: l.profile_id,
        papel: l.papel,
        permissoes: l.permissoes || [],
        nome: mapa.get(l.profile_id)?.name || "—",
        email: mapa.get(l.profile_id)?.email || "—",
      })).sort((a, b) => (a.papel === "owner" ? -1 : b.papel === "owner" ? 1 : 0)),
    );
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unidade.partnerId]);

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


  const alternar = async (m: Membro, permissao: Permissao) => {
    if (m.papel === "owner") return;
    const novas = m.permissoes.includes(permissao)
      ? m.permissoes.filter((p) => p !== permissao)
      : [...m.permissoes, permissao];
    setSalvando(m.id);
    const { error } = await supabase
      .from("partner_members" as never)
      .update({ permissoes: novas } as never)
      .eq("id" as never, m.id as never);
    setSalvando(null);
    if (error) { toast.error(error.message); return; }
    setMembros((prev) => prev.map((x) => (x.id === m.id ? { ...x, permissoes: novas } : x)));
  };

  const mudarPapel = async (m: Membro, papel: "manager" | "staff") => {
    if (m.papel === "owner") return;
    const { error } = await supabase
      .from("partner_members" as never)
      .update({ papel } as never)
      .eq("id" as never, m.id as never);
    if (error) { toast.error(error.message); return; }
    setMembros((prev) => prev.map((x) => (x.id === m.id ? { ...x, papel } : x)));
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
        <h2 className="text-white font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Membros de {unidade.fantasyName}</h2>
        <p className="text-xs text-white/50 mt-1">
          Adicione a recepção ou o gerente desta unidade e libere exatamente o que cada um pode fazer.
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
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : membros.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-8">Nenhum membro nesta unidade ainda.</p>
      ) : (
        membros.map((m) => (
          <div key={m.id} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-white text-sm">{m.nome}</p>
                <p className="text-[11px] text-white/40">{m.email}</p>
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
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
            )}
          </div>
        ))
      )}
    </div>
  );
}
