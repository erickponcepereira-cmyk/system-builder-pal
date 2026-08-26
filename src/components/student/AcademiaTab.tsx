import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useImageCrop } from "@/components/ui/ImageCropProvider";

export type MinhaAcademia = {
  academia: string;
  referencia: string;
  tem_rosto: boolean;
  envio_pendente: boolean;
  valido_ate: string | null;
  decisao: string | null;
  motivo: string | null;
  dias_restantes: number | null;
};

/**
 * Lê a academia do aluno logado.
 *
 * Chama a RPC direto com a sessão do usuário — de propósito. A função no banco
 * resolve o vínculo por `auth.uid()` e não aceita partner_id nem credencial_id,
 * então não existe parâmetro para forjar. Passar por uma função de servidor com
 * service role exigiria mandar o student_id, e aí a segurança dependeria de uma
 * checagem que dá para esquecer.
 */
export async function carregarMinhaAcademia(): Promise<MinhaAcademia | null> {
  const { data, error } = await supabase.rpc("academia_minha_credencial" as never);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as unknown as MinhaAcademia[];
  return linhas[0] ?? null;
}

const MOTIVO: Record<string, { texto: string; tom: "ok" | "atencao" | "bloqueio" }> = {
  contrato_ativo:     { texto: "Seu acesso está liberado", tom: "ok" },
  vencimento_proximo: { texto: "Seu plano vence em breve", tom: "atencao" },
  em_carencia:        { texto: "Seu plano venceu — você ainda entra por alguns dias", tom: "atencao" },
  vencido_bloqueado:  { texto: "Seu plano venceu e a entrada está bloqueada", tom: "bloqueio" },
  sem_mensalidade:    { texto: "Você ainda não tem plano lançado nesta academia", tom: "bloqueio" },
};

export function AcademiaTab() {
  const [dados, setDados] = useState<MinhaAcademia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const { cropToBlob } = useImageCrop();

  const recarregar = () => {
    setCarregando(true);
    carregarMinhaAcademia()
      .then(setDados)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui carregar."))
      .finally(() => setCarregando(false));
  };

  useEffect(recarregar, []);

  const escolherFoto = async (arquivo: File) => {
    setEnviando(true);
    try {
      // O recorte já é quadrado por natureza. O que importa aqui é o enquadramento:
      // o leitor quer o rosto centralizado, e mandar a foto inteira do celular
      // derruba a qualidade do reconhecimento.
      const recortada = await cropToBlob(arquivo, { title: "Enquadre o seu rosto" });
      if (!recortada) return;

      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Não consegui ler a foto."));
        fr.readAsDataURL(recortada);
      });

      const { error } = await supabase.rpc("academia_meu_rosto_enfileirar" as never, {
        p_foto_base64: base64.replace(/^data:[^;]+;base64,/, ""),
      } as never);
      if (error) throw new Error(error.message);

      toast.success("Foto enviada. Ela entra no equipamento na próxima sincronização.");
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };

  if (carregando) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />;
  if (!dados) return null;

  const estado = dados.motivo ? MOTIVO[dados.motivo] : null;
  const corEstado =
    estado?.tom === "ok" ? "text-emerald-400"
    : estado?.tom === "atencao" ? "text-amber-300"
    : "text-red-400";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-[11px] uppercase tracking-wider text-white/40">Sua academia</p>
        <p className="text-lg font-bold text-white">{dados.academia}</p>

        {estado && (
          <div className="mt-3 flex items-start gap-2">
            {estado.tom === "ok"
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              : <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${corEstado}`} />}
            <div>
              <p className={`text-sm font-semibold ${corEstado}`}>{estado.texto}</p>
              {dados.valido_ate && (
                <p className="text-[11px] text-white/50">
                  Plano até {new Date(`${dados.valido_ate}T12:00:00`).toLocaleDateString("pt-BR")}
                  {dados.dias_restantes !== null && dados.dias_restantes >= 0
                    ? ` · faltam ${dados.dias_restantes} dia(s)`
                    : dados.dias_restantes !== null
                      ? ` · venceu há ${Math.abs(dados.dias_restantes)} dia(s)`
                      : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <Camera className="h-4 w-4 text-primary" /> Seu rosto na catraca
        </p>

        {dados.envio_pendente ? (
          <p className="mt-2 flex items-start gap-2 text-[12px] text-amber-300">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Foto enviada, esperando entrar no equipamento. Isso acontece sozinho, em
            poucos minutos — não precisa mandar de novo.
          </p>
        ) : dados.tem_rosto ? (
          <p className="mt-2 text-[12px] text-white/60">
            Você já está cadastrado no equipamento. Só mande outra foto se a catraca
            estiver com dificuldade de reconhecer você.
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-white/60">
            Você ainda não tem rosto cadastrado — sem ele a catraca não abre. Mande
            uma foto e resolva antes de chegar na academia.
          </p>
        )}

        <p className="mt-2 text-[11px] text-white/40">
          Rosto de frente, boa luz, sem boné e sem óculos escuros. A foto vai direto
          para o equipamento da academia e <strong className="text-white/60">não fica
          guardada no aplicativo</strong>.
        </p>

        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void escolherFoto(f);
          }}
        />
        <button
          type="button"
          disabled={enviando}
          onClick={() => arquivoRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {enviando ? "Enviando…" : dados.tem_rosto ? "Enviar outra foto" : "Enviar minha foto"}
        </button>
      </div>
    </div>
  );
}
