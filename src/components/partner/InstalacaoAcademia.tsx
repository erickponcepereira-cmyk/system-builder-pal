import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Fingerprint, MessageCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { obterPacotesInstalacao } from "@/lib/academia-teste.functions";

/**
 * Manual de instalação da academia nova, escrito para a recepção.
 *
 * Até aqui instalar numa academia nova era copiar a pasta do PC de outra
 * academia na mão — e a pasta copiada já nascia velha, porque ninguém volta
 * para atualizá-la depois de publicar uma correção. Os arquivos daqui saem da
 * mesma versão publicada que os PCs já instalados aplicam sozinhos.
 */

type Programa = "agente" | "conector";
type Pacote = { versao: string; notas: string | null; arquivos: string[] } | null;
type EstadoBase = { existe: boolean; bytes: number | null; atualizado_em: string | null };

const MB = (bytes: number | null) =>
  bytes === null ? "" : `${(bytes / 1024 / 1024).toFixed(0)} MB`;

const cartao = "rounded-xl border border-aca-line bg-aca-alto p-3";
const codigo = "rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-aca-ink";

async function baixarArquivo(partnerId: string, programa: Programa, nome: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    toast.error("Sua sessão expirou. Entre de novo e tente outra vez.");
    return;
  }

  const busca = new URLSearchParams({ partnerId, programa, nome });
  const resposta = await fetch(`/api/instalacao/arquivo?${busca}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) {
    toast.error(await resposta.text());
    return;
  }

  // O token viaja no cabeçalho, e não na URL, para não parar em log de
  // servidor — então isto não pode ser um link comum: o navegador não mandaria
  // cabeçalho nenhum num <a href>. Busca aqui e entrega o resultado ao salvar.
  const endereco = URL.createObjectURL(await resposta.blob());
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome.split("/").pop() ?? nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Soltar o endereço no mesmo instante cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

/**
 * Os dois pacotes de uma vez, em vez de um arquivo por clique.
 *
 * `codigo` vem montado pelo servidor e chega como bytes. `base` não: são
 * dezenas de MB de binário, então o servidor devolve uma URL assinada e o
 * navegador busca direto no storage — o download nem passa pela aplicação.
 */
async function baixarPacote(partnerId: string, programa: Programa, tipo: "codigo" | "base") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    toast.error("Sua sessão expirou. Entre de novo e tente outra vez.");
    return;
  }

  const busca = new URLSearchParams({ partnerId, programa, tipo });
  const resposta = await fetch(`/api/instalacao/pacote?${busca}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) {
    toast.error(await resposta.text());
    return;
  }

  if (tipo === "base") {
    const { url } = (await resposta.json()) as { url: string };
    window.location.href = url;
    return;
  }

  const endereco = URL.createObjectURL(await resposta.blob());
  const link = document.createElement("a");
  link.href = endereco;
  link.download = `fitmind-${programa}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

export function InstalacaoAcademia({ partnerId }: { partnerId: string }) {
  const obter = useServerFn(obterPacotesInstalacao);
  const [carregando, setCarregando] = useState(true);
  const [agente, setAgente] = useState<Pacote>(null);
  const [conector, setConector] = useState<Pacote>(null);
  const [base, setBase] = useState<{ agente: EstadoBase; conector: EstadoBase } | null>(null);

  const carregar = () => {
    setCarregando(true);
    obter({ data: { partnerId } })
      .then((r) => {
        setAgente(r.agente);
        setConector(r.conector);
        setBase(r.base);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregar, [partnerId]);

  return (
    <div className="space-y-3">
      <div className={cartao}>
        <p className="text-sm font-bold text-aca-ink">Instalar a FitMind num computador novo</p>
        <p className="mt-1 text-[11px] text-aca-muted">
          Esta página é para quem vai montar o computador da recepção de uma academia.
          São dois programas, e eles rodam nesse computador — não na nuvem.
          Depois de instalados, eles se atualizam sozinhos: você não volta aqui a cada correção.
        </p>
      </div>

      <OsDoisProgramas />
      <PassoAPassoAgente />
      <PassoAPassoConector />
      <QuandoNaoSobe />

      {!carregando && !base?.agente.existe && !base?.conector.existe && (
      <div className={`${cartao} border-aca-atencao bg-aca-alto`}>
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-aca-atencao">
          <AlertTriangle className="h-3.5 w-3.5" /> O download abaixo não é o instalador completo
        </p>
        <p className="mt-1.5 text-[11px] text-aca-muted">
          Daqui sai <strong className="text-aca-ink">só o código</strong> — os mesmos arquivos que os
          dois programas trocam sozinhos quando se atualizam. Não sai daqui, e continua vindo por
          cópia de uma instalação que já existe:
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] text-aca-muted">
          <li>o <strong className="text-aca-ink">Node</strong>, que é o motor que faz os dois rodarem;</li>
          <li>a pasta <span className={codigo}>node_modules</span>, com as dependências;</li>
          <li>
            os programas de janela (<span className={codigo}>FitMindCatraca.exe</span>,{" "}
            <span className={codigo}>FitMindConector.exe</span>), os arquivos{" "}
            <span className={codigo}>.bat</span> e os ícones — de propósito: se uma atualização
            pudesse reescrever um <span className={codigo}>.exe</span> ou um{" "}
            <span className={codigo}>.bat</span>, ela conseguiria mexer no que abre junto com o
            Windows do cliente.
          </li>
        </ul>
        <p className="mt-1.5 text-[11px] text-aca-muted">
          Ou seja: peça a pasta base ao suporte uma vez, e use os downloads daqui para deixá-la
          na versão de hoje.
        </p>
      </div>
      )}

      {carregando ? (
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-aca-acao" />
      ) : (
        <>
          <PacoteParaBaixar
            titulo="Controlador de acesso (catraca)"
            destino="C:\FitMind\Catraca"
            pacote={agente}
            programa="agente"
            partnerId={partnerId}
            base={base?.agente}
          />
          <PacoteParaBaixar
            titulo="Conector de WhatsApp"
            destino="C:\FitMind\Conector"
            pacote={conector}
            programa="conector"
            partnerId={partnerId}
            base={base?.conector}
          />
        </>
      )}
    </div>
  );
}

function OsDoisProgramas() {
  return (
    <div className={cartao}>
      <p className="text-[11px] font-bold text-aca-ink">Os dois programas</p>

      <div className="mt-2 space-y-2">
        <div className="rounded-lg border border-aca-line bg-black/20 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-aca-ink">
            <Fingerprint className="h-3.5 w-3.5 text-aca-acao" /> Controlador de acesso (catraca)
          </p>
          <p className="mt-1 text-[11px] text-aca-muted">
            Conversa com o leitor facial e gira a catraca. Roda no computador da academia porque o
            cabo da catraca é físico — a nuvem não alcança a porta. Ele baixa quem pode entrar e
            sobe as entradas. Recebe só o identificador da pessoa no equipamento e a data até quando
            ela pode entrar: nome, CPF, contrato e valor nunca chegam nesse computador.
          </p>
        </div>

        <div className="rounded-lg border border-aca-line bg-black/20 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-aca-ink">
            <MessageCircle className="h-3.5 w-3.5 text-aca-acao" /> Conector de WhatsApp
          </p>
          <p className="mt-1 text-[11px] text-aca-muted">
            Mantém o WhatsApp da academia ligado ao robô: é ele que faz as respostas automáticas e
            os avisos de vencimento saírem de verdade. Também roda aqui porque a sessão do WhatsApp
            precisa de um programa ligado o tempo todo, e cada academia usa o próprio número.
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-aca-muted">
        <strong className="text-aca-muted">Instale nesta ordem:</strong> primeiro o controlador de
        acesso, que é o que faz a catraca funcionar; o conector depois, porque ele depende de um
        número já criado na aba Robô.
      </p>
    </div>
  );
}

function PassoAPassoAgente() {
  return (
    <div className={cartao}>
      <p className="text-[11px] font-bold text-aca-ink">1. Controlador de acesso (catraca)</p>
      <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-aca-muted">
        <li>
          Copie a pasta base para o computador da recepção, em{" "}
          <span className={codigo}>C:\FitMind\Catraca</span>.
        </li>
        <li>
          Baixe os arquivos da lista lá embaixo e sobrescreva os de mesmo nome nessa pasta. Os que
          começam com <span className={codigo}>lib/</span> vão <strong className="text-aca-ink">dentro</strong>{" "}
          da subpasta <span className={codigo}>lib</span>, não soltos.
        </li>
        <li>
          Dois cliques em <span className={codigo}>FitMindCatraca.exe</span>. Na primeira abertura
          ele cria sozinho o atalho na área de trabalho e passa a abrir junto com o Windows. Não
          copie só o <span className={codigo}>.exe</span> para a área de trabalho: ele precisa ficar
          junto dos outros arquivos.
        </li>
        <li>
          Aqui no painel, aba <strong className="text-aca-ink">Agente da catraca</strong>, clique em{" "}
          <strong className="text-aca-ink">Gerar código de instalação</strong>. Aparece um código de 8
          letras.
        </li>
        <li>
          Digite esse código no programa que acabou de abrir. Ele vale{" "}
          <strong className="text-aca-ink">uma vez só e por 30 minutos</strong> — se passar disso,
          gere outro, não tem problema.
        </li>
        <li>
          Informe o endereço do leitor facial na rede (algo como{" "}
          <span className={codigo}>192.168.15.240</span>) e a porta da catraca. O suporte passa esses
          dois números.
        </li>
        <li>
          Volte à aba <strong className="text-aca-ink">Agente da catraca</strong>: o computador tem que
          aparecer como <strong className="text-aca-ink">online</strong>. Se aparecer, acabou.
        </li>
      </ol>
      <p className="mt-2 text-[11px] text-aca-muted">
        A partir daí ele se reergue sozinho se cair, guarda as entradas quando a internet some, e
        aplica versão nova na próxima sincronização.
      </p>
    </div>
  );
}

function PassoAPassoConector() {
  return (
    <div className={cartao}>
      <p className="text-[11px] font-bold text-aca-ink">2. Conector de WhatsApp</p>
      <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[11px] text-aca-muted">
        <li>
          Copie a pasta base para <span className={codigo}>C:\FitMind\Conector</span>.{" "}
          <strong className="text-aca-atencao">
            Se vier junto uma pasta chamada <span className={codigo}>sessao</span>, apague.
          </strong>{" "}
          Ela é o WhatsApp da outra academia — se ficar, este computador entra no número errado.
        </li>
        <li>Baixe os arquivos da lista lá embaixo e sobrescreva os de mesmo nome.</li>
        <li>
          Dois cliques em <span className={codigo}>baixar-node.bat</span>. Ele baixa o Node dentro
          da própria pasta: não instala nada no Windows, não pede senha de administrador e não
          conflita com nada que já esteja na máquina.
        </li>
        <li>
          Dois cliques em <span className={codigo}>iniciar.bat</span>. Na primeira vez ele baixa as
          dependências — leva alguns minutos e precisa de internet.
        </li>
        <li>
          Aqui no painel, aba <strong className="text-aca-ink">Robô</strong>, clique em{" "}
          <strong className="text-aca-ink">Conectar número</strong>, dê um apelido (por exemplo,
          "recepção") e confirme. Depois clique em{" "}
          <strong className="text-aca-ink">Dados do conector</strong>: aparecem três campos, cada um
          com botão de copiar.
        </li>
        <li>
          No navegador <strong className="text-aca-ink">daquele computador</strong>, abra{" "}
          <span className={codigo}>http://localhost:3100</span>. Cole os três campos e clique{" "}
          <strong className="text-aca-ink">Salvar</strong>.
        </li>
        <li>
          Clique <strong className="text-aca-ink">Testar ligação com a FitMind</strong>. A luz da nuvem
          tem que ficar verde.
        </li>
        <li>
          Aparece um QR na tela. No celular da academia:{" "}
          <strong className="text-aca-ink">WhatsApp → Aparelhos conectados → Conectar aparelho</strong>,
          e aponte para o QR.
        </li>
        <li>
          A luz do WhatsApp fica verde. Na aba <strong className="text-aca-ink">Robô</strong> daqui, o
          conector passa a aparecer como <em>online agora</em>.
        </li>
        <li>
          Para ele abrir sozinho quando ligarem o computador: botão direito em{" "}
          <span className={codigo}>instalar-inicio-automatico.bat</span> e{" "}
          <em>Executar como administrador</em>.
        </li>
      </ol>
      <p className="mt-2 text-[11px] text-aca-muted">
        O segredo que você copia dá acesso a ler e enviar mensagens desse número. Não mande por
        grupo nem por e-mail.
      </p>
    </div>
  );
}

const PROBLEMAS: Array<[string, string]> = [
  ["O código de 8 letras não é aceito",
   "Ele vale uma vez só e expira em 30 minutos. Gere outro na aba Agente da catraca e digite na hora."],
  ["O computador não aparece como online",
   "Ele só se apresenta enquanto está aberto. Procure o ícone perto do relógio — pode estar escondido atrás da setinha ^. Se não estiver lá, abra o FitMindCatraca.exe de novo."],
  ["A catraca parou de girar",
   "Abra a tela do programa e clique em Devolver ao sistema antigo. A catraca volta a ser controlada como antes, na hora. Só depois chame o suporte."],
  ["Baixei os arquivos e nada mudou",
   "Quase sempre é arquivo no lugar errado: os que começam com lib/ precisam ficar dentro da subpasta lib. Feche o programa, arrume os arquivos e abra de novo."],
  ["O localhost:3100 não abre",
   "O iniciar.bat não está rodando. Abra de novo e leia o que aparece na janela preta antes de fechá-la."],
  ["A luz da nuvem não fica verde",
   "Os três campos foram colados errado, ou a internet caiu. Copie de novo em Robô → Dados do conector, um de cada vez."],
  ["O QR não aparece ou some",
   "Recarregue o localhost:3100. O QR expira sozinho depois de um tempo parado."],
  ["O WhatsApp desconectou sozinho",
   "Alguém saiu em Aparelhos conectados no celular. Apague a pasta sessao, abra o conector de novo e leia o QR outra vez."],
  ["O painel do conector mostra mensagens presas aqui",
   "Não faça nada. Elas sobem sozinhas quando a internet voltar — é proteção contra oscilação da rede."],
];

function QuandoNaoSobe() {
  return (
    <div className={cartao}>
      <p className="text-[11px] font-bold text-aca-ink">Quando alguma coisa não sobe</p>
      <div className="mt-2 space-y-2">
        {PROBLEMAS.map(([sintoma, saida]) => (
          <div key={sintoma}>
            <p className="text-[11px] font-semibold text-aca-ink">{sintoma}</p>
            <p className="text-[11px] text-aca-muted">{saida}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-aca-muted">
        Se nada disso resolveu: no controlador de acesso, botão direito no ícone perto do relógio →{" "}
        <strong className="text-aca-muted">Ver registro técnico</strong>. É o que o suporte vai pedir.
      </p>
    </div>
  );
}

function PacoteParaBaixar({ titulo, destino, pacote, programa, partnerId, base }: {
  titulo: string;
  destino: string;
  pacote: Pacote;
  programa: Programa;
  partnerId: string;
  base?: EstadoBase;
}) {
  const [baixando, setBaixando] = useState<string | null>(null);
  if (!pacote) {
    return (
      <div className={cartao}>
        <p className="text-[11px] font-bold text-aca-ink">{titulo}</p>
        <p className="mt-1 text-[11px] text-aca-atencao">
          Nenhuma versão publicada ainda. Sem isso não há o que baixar — fale com o suporte.
        </p>
      </div>
    );
  }

  return (
    <div className={cartao}>
      <p className="text-[11px] font-bold text-aca-ink">{titulo}</p>
      <p className="text-[11px] text-aca-muted">
        versão {pacote.versao} · {pacote.arquivos.length} arquivo(s) · salve em{" "}
        <span className={codigo}>{destino}</span>
      </p>
      {pacote.notas && <p className="mt-1 text-[11px] text-aca-fraco">{pacote.notas}</p>}

      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
        {base?.existe && (
          <button
            type="button"
            disabled={baixando === "base"}
            onClick={async () => {
              setBaixando("base");
              try { await baixarPacote(partnerId, programa, "base"); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao baixar"); }
              finally { setBaixando(null); }
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-aca-acao px-3 py-2 text-[11px] font-bold text-aca-acao-ink disabled:opacity-50"
          >
            {baixando === "base"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            Baixar o sistema completo {MB(base.bytes) && `(${MB(base.bytes)})`}
          </button>
        )}

        <button
          type="button"
          disabled={baixando === "codigo"}
          onClick={async () => {
            setBaixando("codigo");
            try { await baixarPacote(partnerId, programa, "codigo"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao baixar"); }
            finally { setBaixando(null); }
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-aca-line px-3 py-2 text-[11px] font-semibold text-aca-ink hover:bg-aca-alto disabled:opacity-50"
        >
          {baixando === "codigo"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          Só o código ({pacote.arquivos.length} arquivos, .zip)
        </button>
      </div>

      {base?.existe
        ? (
          <p className="mt-1.5 text-[11px] text-aca-fraco">
            O sistema completo já traz Node, dependências e os programas de janela. Depois de
            instalado ele se atualiza sozinho — não precisa voltar aqui a cada correção.
            {base.atualizado_em && ` Pacote de ${new Date(base.atualizado_em).toLocaleDateString("pt-BR")}.`}
          </p>
        )
        : (
          <p className="mt-1.5 text-[11px] text-aca-atencao">
            O pacote completo deste programa ainda não foi publicado pela FitMind — por enquanto só sai o código.
          </p>
        )}

      <div className="mt-2 space-y-1">
        {pacote.arquivos.map((nome) => (
          <div key={nome} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
            <span className="truncate font-mono text-[11px] text-aca-muted">{nome}</span>
            <button
              type="button"
              disabled={baixando === nome}
              onClick={async () => {
                setBaixando(nome);
                try { await baixarArquivo(partnerId, programa, nome); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao baixar"); }
                finally { setBaixando(null); }
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-aca-line px-2.5 py-1 text-[10px] font-semibold text-aca-muted hover:bg-aca-alto disabled:opacity-50"
            >
              {baixando === nome
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Download className="h-3 w-3" />}
              Baixar
            </button>
          </div>
        ))}
      </div>

      {pacote.arquivos.some((n) => n.includes("/")) && (
        <p className="mt-2 text-[11px] text-aca-atencao">
          O navegador salva todos soltos na pasta de downloads, sem subpasta. Os que aparecem como{" "}
          <span className={codigo}>lib/…</span> precisam ir para dentro da subpasta{" "}
          <span className={codigo}>lib</span> — soltos, o programa não acha e não abre.
        </p>
      )}

      <p className="mt-2 text-[11px] text-aca-fraco">
        Um arquivo por vez, de propósito: assim dá para conferir cada um no lugar certo, e não
        existe zip para alguém descompactar por cima da pasta errada.
      </p>
    </div>
  );
}

export default InstalacaoAcademia;
