import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { cadastrarPessoaAcademia } from "@/lib/academia-teste.functions";

const mascararTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/**
 * Cadastro de balcão para quem não é da FitMind.
 *
 * Nome, telefone e nascimento — nada mais. Quem está na recepção com a pessoa
 * na frente não vai preencher ficha; e sem esse cadastro não existia jeito de
 * lançar a mensalidade de um cliente novo.
 */
export function CadastrarPessoaAcademia({
  partnerId, aoCriar, aoCancelar,
}: {
  partnerId: string;
  aoCriar: (p: { credencialId: string; nome: string; referencia: string }) => void;
  aoCancelar: () => void;
}) {
  const cadastrar = useServerFn(cadastrarPessoaAcademia);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    setSalvando(true);
    try {
      const r = await cadastrar({ data: { partnerId, nome, telefone, nascimento } });
      if (r.jaExistia) {
        toast.info(`Este telefone já é de ${r.nome}. Continuando a renovação dessa pessoa.`);
      } else {
        toast.success(`Cadastrado · identificador ${r.referencia}`);
      }
      aoCriar({ credencialId: r.credencialId, nome: r.nome, referencia: r.referencia });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSalvando(false);
    }
  };

  const podeSalvar =
    nome.trim().length >= 3 && telefone.replace(/\D/g, "").length >= 10 && nascimento.length === 10;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-white">Cadastrar pessoa nova</p>
      </div>
      <p className="text-[11px] text-white/50">
        Para quem não tem conta na FitMind. Fica só nesta academia e já segue para a mensalidade.
      </p>

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome completo"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      <div className="flex gap-2">
        <input
          value={telefone}
          onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
          inputMode="numeric"
          placeholder="(11) 99999-0000"
          aria-label="Telefone"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <input
          value={nascimento}
          onChange={(e) => setNascimento(e.target.value)}
          type="date"
          aria-label="Data de nascimento"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando || !podeSalvar}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Cadastrar e lançar mensalidade
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default CadastrarPessoaAcademia;
