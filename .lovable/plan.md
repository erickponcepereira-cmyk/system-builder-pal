# Anamnese completa + aviso "curso não encontrado" no cadastro novo

## 1. Anamnese aparecendo incompleta

O que confirmei no banco e no código:

- A ficha de anamnese guarda 44 campos (profissão, estado civil, objetivos alimentares, diário alimentar refeição a refeição, água por dia, tipo/nível/tempo de exercício, álcool, tabaco, estratégias de estresse, alimentos que não gosta, etc.).
- A ficha preenchida em 28/08 está completa no banco — os dados existem.
- A tela do coach (detalhes do aluno) lê apenas ~21 desses campos. Todo o resto simplesmente não é buscado, por isso "não aparece tudo".
- A aba **Profissional > Anamnese** lê uma tabela diferente (o questionário próprio do profissional para clientes externos). Ela nunca mostra a anamnese oficial preenchida pelo aluno FitMind. Além disso, as regras de acesso da tabela de anamnese liberam leitura hoje só para o próprio aluno, o coach responsável e o admin — profissional não tem permissão.

O que será feito:

1. Criar um bloco único de exibição da anamnese, com todos os campos preenchidos (incluindo diário alimentar em formato de tabela e listas de objetivos), escondendo apenas o que estiver vazio.
2. Usar esse mesmo bloco na ficha do aluno no painel do coach, passando a buscar todos os campos.
3. Na aba Profissional > Anamnese, além do questionário próprio, mostrar a anamnese oficial do aluno FitMind quando o cliente estiver vinculado a um aluno da plataforma, usando o mesmo bloco.
4. Liberar a leitura da anamnese para o profissional apenas quando ele tiver vínculo com aquele aluno (cliente de avaliação vinculado, agendamento ou colaborador), sem abrir acesso geral.

## 2. Aviso "curso não encontrado" para quem vai pagar a adesão de R$ 179,90

Diagnóstico ainda não confirmado — não vou afirmar causa sem reproduzir. O que já sei:

- A única mensagem com esse texto no sistema é o aviso da tela do player de curso, mostrado quando o curso pedido não é encontrado ou a pessoa ainda não tem acesso.
- Existe apenas um curso com conteúdo cadastrado ("Formação de Coach FitMind") e nenhuma compra de curso registrada até agora.

Passos:

1. Reproduzir com uma conta nova no ponto exato do pagamento da adesão, identificando em qual tela o aviso surge e qual identificador de curso está sendo aberto.
2. Corrigir a origem: se a tela estiver abrindo um produto que não é curso (a Adesão Anual é um plano, não um curso), o botão/rota deve deixar de apontar para o player.
3. Ajustar a própria tela de curso para, em vez do alarme vermelho de erro, mostrar mensagem correta quando o conteúdo ainda não foi liberado ou ainda está em preparação.
4. Validar o fluxo completo de cadastro novo até a tela de pagamento, sem nenhum aviso indevido.

## Detalhes técnicos

- Novo componente compartilhado de leitura da anamnese e ampliação das colunas buscadas no painel do coach e na função de agendamentos do profissional.
- Uma migration adicionará política de leitura da anamnese para profissional com vínculo comprovado, via função de verificação, mantendo as demais regras intactas.
- A investigação do item 2 usa navegação automatizada na pré-visualização mais os registros de erro do navegador.
