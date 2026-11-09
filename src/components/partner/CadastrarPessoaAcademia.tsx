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
type Pessoa = { credencialId: string; nome: string; referencia: string };

export function CadastrarPessoaAcademia({
  partnerId, aoCriar, aoCancelar,
}: {
  partnerId: string;
  aoCriar: (p: Pessoa) => void;
  aoCancelar: () => void;
}) {
  const cadastrar = useServerFn(cadastrarPessoaAcademia);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Mesmo telefone com outro nome: só quem está com a pessoa na frente sabe se
  // é ela ou alguém da família. Juntar errado dá a mensalidade a outra pessoa;
  // separar errado deixa o rosto num número e a mensalidade em outro.
  const [duvida, setDuvida] = useState<Pessoa | null>(null);

  const confirmar = async (outraPessoa = false) => {
    setSalvando(true);
    try {
      const r = await cadastrar({ data: { partnerId, nome, telefone, nascimento, outraPessoa } });
      if (r.duvida) {
        setDuvida(r.duvida);
        return;
      }
      if (r.jaExistia) {
        toast.info(`${r.nome} já tem cadastro (id ${r.referencia}). Continuando a renovação dessa pessoa.`);
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

  if (duvida) {
    return (
      <div className="space-y-3 rounded-xl border border-aca-atencao bg-aca-alto p-3">
        <p className="text-sm font-bold text-aca-ink">Este telefone já está cadastrado</p>
        <p className="text-[11px] text-aca-muted">
          Ele pertence a <strong className="font-semibold text-aca-ink">{duvida.nome}</strong>{" "}
          (id <span className="font-mono tabular-nums">{duvida.referencia}</span>). {nome.trim()} é a mesma pessoa?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => aoCriar(duvida)}
            disabled={salvando}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-aca-acao px-3 py-2 text-xs font-bold text-aca-acao-ink disabled:opacity-50"
          >
            Sim, renovar {duvida.nome}
          </button>
          <button
            type="button"
            onClick={() => void confirmar(true)}
            disabled={salvando}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-aca-line px-3 py-2 text-xs text-aca-ink hover:bg-aca-line disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Não, é outra pessoa
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDuvida(null)}
          disabled={salvando}
          className="text-[11px] text-aca-muted underline-offset-2 hover:underline"
        >
          Voltar e corrigir os dados
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-aca-line bg-aca-alto p-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-aca-acao" />
        <p className="text-sm font-bold text-aca-ink">Cadastrar pessoa nova</p>
      </div>
      <p className="text-[11px] text-aca-muted">
        Para quem não tem conta na FitMind. Fica só nesta academia e já segue para a mensalidade.
      </p>

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome completo"
        className="w-full rounded-lg border border-aca-line bg-aca-alto px-3 py-2 text-sm text-aca-ink placeholder:text-aca-fraco"
      />
      <div className="flex gap-2">
        <input
          value={telefone}
          onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
          inputMode="numeric"
          placeholder="(11) 99999-0000"
          aria-label="Telefone"
          className="min-w-0 flex-1 rounded-lg border border-aca-line bg-aca-alto px-3 py-2 text-sm text-aca-ink placeholder:text-aca-fraco"
        />
        <input
          value={nascimento}
          onChange={(e) => setNascimento(e.target.value)}
          type="date"
          aria-label="Data de nascimento"
          className="min-w-0 flex-1 rounded-lg border border-aca-line bg-aca-alto px-3 py-2 text-sm text-aca-ink"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando || !podeSalvar}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-aca-acao px-3 py-2 text-xs font-bold text-aca-acao-ink disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Cadastrar e lançar mensalidade
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-lg border border-aca-line px-3 py-2 text-xs text-aca-muted hover:bg-aca-line"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default CadastrarPessoaAcademia;
