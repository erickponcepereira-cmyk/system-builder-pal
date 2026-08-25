# Unificar Registrar/Renovar com o fluxo de mensalidade da academia

Hoje as duas abas fazem coisas diferentes:

- **Alunos da academia**: tem o botão "Cadastrar pessoa nova", escolhe plano da tabela, aceita pagamento dividido e grava com o cálculo de taxa por forma.
- **Registrar / renovar**: só encontra quem já é aluno FitMind, exige digitar o nome do plano na mão, exige digitar a data de validade na mão e aceita uma única forma de pagamento — e grava sem detalhar as formas.

Ou seja, os dois lançamentos caem na mesma tabela de mensalidades, mas o de Registrar/Renovar não gera o detalhamento por forma de pagamento que o relatório usa.

## O que muda

Registrar/Renovar passa a ser a mesma tela de lançamento usada na outra aba:

- Botão **"Cadastrar pessoa nova (não é da FitMind)"** também aqui, com nome, telefone e nascimento, já emendando na mensalidade.
- A busca encontra tanto alunos FitMind quanto pessoas só da academia (identificador da catraca), não só alunos da plataforma.
- **Planos** aparecem como botões (mensal, trimestral etc.), com o preço de tabela já preenchido e editável.
- **Válido até** passa a ser um campo preenchido automaticamente: ao escolher o plano, soma a duração do plano a partir de hoje (trimestral avança 3 meses), ou a partir do vencimento atual quando a pessoa ainda está em dia. A recepção pode alterar a data manualmente antes de confirmar.
- Pagamento dividido entre formas, com taxa por forma, igual à outra aba.

Resultado: um único lançamento, uma única regra de data e taxa, e o mesmo registro no relatório, venha de qual aba vier.

## Detalhes técnicos

Banco (uma migration):
- `academia_renovar` ganha o parâmetro opcional `p_valido_ate date DEFAULT NULL`. Quando informado, usa essa data (validando que é futura) em vez de `base + p_dias`; quando nulo, mantém exatamente o comportamento atual.

Código:
- `RenovarAluno.tsx`: campo "Válido até" com data calculada (`base + dias` do plano, base = hoje ou vencimento vigente), recalculada ao trocar de plano e editável; envia `validoAte` para a server fn. Passa a aceitar uma prop opcional para exibir/ocultar o cabeçalho, para servir também como formulário de lançamento novo.
- `academia-teste.functions.ts`: `renovarMensalidadeAcademia` aceita `validoAte?: string | null` e repassa para a RPC. Nova busca `buscarPessoasAcademia` (ou extensão de `buscarAlunosParaMensalidade`) que retorna também credenciais sem `student_id`, devolvendo `{ credencialId, studentId, nome, referencia }`. `registrarMensalidadeAcademia` deixa de ser usada pela tela (mantida por compatibilidade).
- `AcademiaTestePanel.tsx`: `FormMensalidade` é substituída por um painel que reusa `CadastrarPessoaAcademia` + a nova busca + `RenovarAluno`. O antigo formulário manual (plano em texto livre, forma única, `previewTaxaAcademia`) sai da tela.
