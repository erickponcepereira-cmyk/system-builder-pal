import type { ReactNode } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { Bloco, EYEBROW, NOTA, Selo } from "@/components/partner/VisualAcademia";

/**
 * O manual da recepção, dentro do sistema.
 *
 * Ele existia como página solta, fora do app. Manual que mora fora do lugar
 * onde se trabalha é manual que ninguém abre — e, pior, que envelhece sem
 * ninguém perceber: a versão publicada ainda falava de abas que mudaram de
 * nome e não conhecia o QR nem a reserva. Aqui ele fica ao lado dos botões que
 * descreve, e quem mexe numa aba tropeça no texto dela.
 *
 * Fechado por padrão, um <details> por tarefa: quem procura "como renovar" não
 * quer rolar nove tarefas até achar a segunda.
 */

type Tarefa = {
  n: string;
  titulo: string;
  quando: string;
  onde?: string;
  /** Quando a tarefa não vale para toda academia, o recorte fica em cima. */
  soQuando?: string;
  passos: ReactNode[];
  nota?: { titulo: string; texto: ReactNode };
};

const forte = (t: string) => <strong className="font-semibold text-aca-ink">{t}</strong>;

const TAREFAS: Tarefa[] = [
  {
    n: "01",
    titulo: "Abrir o programa da catraca",
    quando: "Uma vez, ao ligar o computador",
    onde: "No computador da recepção, não neste site",
    soQuando: "Só nas academias que têm catraca",
    passos: [
      <>Dois cliques no ícone da FitMind perto do relógio. Se não aparecer, clique na setinha <code className="font-mono text-[11px]">^</code> — o Windows esconde ícones novos ali.</>,
      <>Confira no canto de baixo à direita se aparece a versão.</>,
      <>Confira se diz {forte("Pessoas liberadas")} com um número. Se estiver zerado, clique em {forte("Sincronizar agora")}.</>,
    ],
    nota: {
      titulo: "Não precisa fazer isso todo dia",
      texto: <>O programa abre junto com o Windows e se reergue se cair. Isto é só para conferir quando alguém desligar o computador.</>,
    },
  },
  {
    n: "02",
    titulo: "Renovar a mensalidade de alguém",
    quando: "Toda vez que um aluno paga",
    onde: "Aba Alunos da academia → botão Renovar na linha da pessoa",
    passos: [
      <>Procure a pessoa pelo nome — ou pelo número dela no leitor.</>,
      <>Clique em {forte("Renovar")} na linha dela e escolha o plano. O preço já vem preenchido.</>,
      <>Pagou com desconto ou a mais? Corrija o valor. Vale o que você recebeu.</>,
      <>Pagou de duas formas? Clique em {forte("+ dividir")} e diga quanto foi em cada uma.</>,
      <>Confirme. Em até três minutos ela já passa na catraca, sem apertar mais nada.</>,
    ],
    nota: {
      titulo: "Renovar antes de vencer não perde dias",
      texto: <>Se o plano vence dia 30 e ela renova dia 25, os 30 dias novos contam a partir do dia {forte("30")}. Ninguém perde o que já pagou.</>,
    },
  },
  {
    n: "03",
    titulo: "Cadastrar o rosto de um aluno",
    quando: "Quando alguém novo entra, ou o rosto não está lendo",
    onde: "Aba Agente da catraca → Cadastrar rosto pela câmera do leitor",
    soQuando: "Só nas academias que têm leitor de rosto",
    passos: [
      <>Digite o nome da pessoa. A lista aparece sozinha; clique no nome certo.</>,
      <>Se for gente nova, que ainda não está no leitor, abra {forte("Pessoa nova")} e digite o nome completo.</>,
      <>Peça para ela olhar para o leitor e clique em {forte("Capturar pelo leitor")}.</>,
      <>O leitor conta alguns segundos e captura. A tela avisa quando deu certo.</>,
    ],
    nota: {
      titulo: "Se aparecer erro",
      texto: <>A mensagem vem do próprio equipamento. O mais comum é a pessoa se mexer ou estar contra a luz. Peça para ficar parada, de frente, e tente de novo.</>,
    },
  },
  {
    n: "04",
    titulo: "Receber quem chega com o QR",
    quando: "Na entrada, quando a academia não usa catraca",
    onde: "Aba Recepção e reservas",
    soQuando: "Só nas academias sem catraca",
    passos: [
      <>Clique em {forte("Ler o QR do aluno")} e aponte a câmera. Se a câmera falhar, digite o código à mão.</>,
      <>A tela responde na hora: nome, se está liberado, e até quando a mensalidade vale.</>,
      <>Se aparecer {forte("recusado")}, é mensalidade — cobre antes de liberar.</>,
    ],
    nota: {
      titulo: "Ler duas vezes não conta treino duplo",
      texto: <>Dentro de 5 minutos, a segunda leitura do mesmo código é entendida como você conferindo, e não como a pessoa treinando de novo. Sem isso, cada conferida viraria um treino no relatório de frequência.</>,
    },
  },
  {
    n: "05",
    titulo: "Liberar a entrada na mão",
    quando: "Rosto não lê, visitante chega, ou qualquer imprevisto",
    onde: "Aba Agente da catraca → Liberar na mão",
    passos: [
      <>Se for um aluno, digite o número dele — a entrada fica registrada no nome dele.</>,
      <>Se for visitante, deixe em branco.</>,
      <>Clique em {forte("Liberar a catraca")}.</>,
    ],
    nota: {
      titulo: 'A tela nunca diz "entrou"',
      texto: <>Ela diz {forte("comando enviado")}, e isso é de propósito: a catraca não avisa de volta se girou. Se não girar, olhe a catraca — não a tela.</>,
    },
  },
  {
    n: "06",
    titulo: "Aluno novo, do zero",
    quando: "Matrícula na recepção",
    onde: "Três abas, nesta ordem",
    passos: [
      <>{forte("Cadastre o rosto")} — tarefa 03, usando “Pessoa nova”.</>,
      <>{forte("Lance a mensalidade")} — tarefa 02, com o plano que ela comprou.</>,
      <>Espere até três minutos e peça para ela passar. O computador atualiza sozinho.</>,
      <>Confira na aba {forte("Alunos da academia")}: tem que aparecer liberada, com a data de validade.</>,
    ],
    nota: {
      titulo: "Cadastro só com nome não dá aplicativo",
      texto: <>Quem entra só como credencial do leitor {forte("entra pela catraca e mais nada")} — não tem QR, não reserva aula e não aparece no aplicativo. Peça para a pessoa se cadastrar no aplicativo com o mesmo telefone, e ligue as duas pontas na aba Alunos da academia.</>,
    },
  },
  {
    n: "07",
    titulo: "Avisar quem está vencendo",
    quando: "Uma vez por dia, de manhã",
    onde: "Aba Avisos de vencimento, depois aba Robô",
    passos: [
      <>Abra {forte("Avisos de vencimento")} e veja quantas pessoas entraram hoje.</>,
      <>Vá para a aba {forte("Robô")} → Disparos.</>,
      <>Abra a campanha do dia, confira o texto e a lista, e dispare.</>,
    ],
    nota: {
      titulo: "Não mande por fora",
      texto: <>O robô espaça as mensagens e mostra “digitando” antes de cada uma. Mandar tudo de uma vez, por fora, é o que faz o WhatsApp bloquear o número da academia.</>,
    },
  },
  {
    n: "08",
    titulo: "Receber um day-use",
    quando: "Visitante que quer treinar um dia",
    onde: "Aba Day-use",
    passos: [
      <>Digite o CPF da pessoa. A tela diz na hora se ela pode ou {forte("se já usou")}.</>,
      <>Se puder, preencha nome, telefone e o valor cobrado, e registre.</>,
      <>Libere a entrada dela pela tarefa 05.</>,
    ],
    nota: {
      titulo: "Peça o telefone sempre",
      texto: <>É por ele que a academia chama essa pessoa de volta depois. Day-use sem telefone é uma visita que se perde.</>,
    },
  },
  {
    n: "09",
    titulo: "Ver como a academia está",
    quando: "Quando quiser",
    onde: "Abas Relatório, Fluxo de caixa e Frequência",
    passos: [
      <>{forte("Relatório")} mostra o mês: recebido, taxas da maquininha, líquido e quem vence em 7 dias — esta última é a sua lista de trabalho da semana.</>,
      <>{forte("Fluxo de caixa")} mostra entrada e saída de dinheiro, inclusive o que não é mensalidade.</>,
      <>{forte("Frequência → Constância")} mostra quem está sumindo antes de cancelar, e {forte("Faltas")} mostra quem ficou abaixo do combinado.</>,
    ],
    nota: {
      titulo: "Constância precisa de tempo",
      texto: <>A régua só classifica alguém depois de {forte("duas semanas completas")} de registro dessa pessoa. Enquanto a catraca for nova, quase todo mundo aparece como “sem histórico” — é a régua se recusando a acusar quem ela ainda não mediu.</>,
    },
  },
  {
    n: "10",
    titulo: "Quando a catraca não abre",
    quando: "Emergência",
    onde: "Vá pela ordem: cada passo resolve uma causa diferente",
    passos: [
      <>{forte("A pessoa está em dia?")} Procure o nome na aba Alunos da academia. Se estiver bloqueada, é mensalidade — cobre e renove.</>,
      <>{forte("O leitor mostrou verde?")} Verde e a catraca não girou, é a catraca. Vermelho, é cadastro ou mensalidade.</>,
      <>{forte("O programa está aberto?")} Ícone perto do relógio. Se sumiu, abra pelo atalho na área de trabalho.</>,
      <>{forte("Libere na mão")} (tarefa 05) para não segurar a fila, e resolva depois.</>,
    ],
    nota: {
      titulo: "Se nada disso resolver",
      texto: <>Na tela do programa, clique em {forte("Devolver ao sistema antigo")}. A catraca volta a ser controlada como era antes, na hora. Depois chame o suporte.</>,
    },
  },
];

function TarefaDoManual({ t }: { t: Tarefa }) {
  return (
    <details className="group rounded-xl border border-aca-line bg-aca-surface open:bg-aca-alto">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aca-acao">
        <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-aca-fraco">{t.n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-aca-ink">{t.titulo}</span>
          <span className={`mt-0.5 block ${NOTA}`}>{t.quando}</span>
        </span>
        <ChevronDown aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-aca-muted transition group-open:rotate-180" />
      </summary>

      <div className="space-y-2 border-t border-aca-line px-3 pb-3 pt-2">
        {t.soQuando && <div><Selo>{t.soQuando}</Selo></div>}
        {t.onde && <p className={EYEBROW}>{t.onde}</p>}

        <ol className="ml-4 list-decimal space-y-1.5 text-[13px] leading-snug text-aca-muted marker:text-aca-fraco">
          {t.passos.map((p, i) => <li key={i}>{p}</li>)}
        </ol>

        {t.nota && (
          <Bloco tom="atencao">
            <p className="text-[12px] font-bold text-aca-ink">{t.nota.titulo}</p>
            <p className={`mt-1 ${NOTA}`}>{t.nota.texto}</p>
          </Bloco>
        )}
      </div>
    </details>
  );
}

export function ManualDaRecepcao() {
  return (
    <div className="space-y-2">
      <Bloco>
        <p className="flex items-center gap-2 text-sm font-bold text-aca-ink">
          <BookOpen className="h-4 w-4 text-aca-muted" /> Manual da recepção
        </p>
        <p className={`mt-1 ${NOTA}`}>
          Tudo que se faz no dia a dia, na ordem em que acontece. Cada tarefa tem os passos e o que
          fazer quando não funciona. Clique numa para abrir.
        </p>
      </Bloco>

      {TAREFAS.map((t) => <TarefaDoManual key={t.n} t={t} />)}

      <p className={`pt-1 text-center ${NOTA}`}>
        Dúvida que não está aqui: chame o suporte da FitMind antes de mexer na configuração.
      </p>
    </div>
  );
}
