# Cadastrar pessoa nova na catraca (Registrar/Renovar)

Hoje a aba só renova quem já existe: ou é aluno da FitMind, ou já veio como credencial importada do leitor. Quem chega no balcão sem nenhum dos dois não tem como ser lançado.

## O que muda

Na aba **Registrar/Renovar** aparece um botão **"Cadastrar pessoa nova"**, com um formulário curto:

- Nome completo (obrigatório)
- Telefone (obrigatório, com máscara)
- Data de nascimento (obrigatória)

Ao confirmar, a pessoa é criada como cadastro **local da academia** (não vira conta FitMind, não pede e-mail nem senha) e a tela já abre em seguida a renovação dela — escolher plano, valor e forma de pagamento — sem precisar procurar de novo na lista.

Regras:

- Se já existir alguém nessa academia com o mesmo telefone, o sistema avisa e oferece renovar essa pessoa em vez de duplicar.
- A pessoa passa a aparecer na lista de mensalidades e nos relatórios como qualquer outra, com o identificador gerado (usado para liberar na catraca e depois cadastrar o rosto).
- Se mais tarde essa pessoa criar conta na FitMind, o vínculo pode ser feito pela aba de credenciais sem vínculo, como já funciona hoje.

## Detalhes técnicos

Banco (uma migration):
- `academia_credenciais`: nova coluna `nascimento date` (a tabela já tem `telefone` e `nome_no_equipamento`).
- Nova função `academia_cadastrar_pessoa(p_partner_id, p_nome, p_telefone, p_nascimento)` SECURITY DEFINER com `search_path = public`, que valida o acesso do chamador à unidade (mesma checagem usada pelas demais funções da academia), gera uma `referencia` numérica livre de 6 dígitos para `tipo = 'pin'` (respeitando a unicidade `partner_id + tipo + referencia`), insere a credencial com `student_id` nulo e devolve `{ credencial_id, referencia }`. Se já houver credencial ativa com o mesmo telefone na unidade, devolve a existente com um aviso em vez de criar outra.

Código:
- `src/lib/academia-teste.functions.ts`: nova server fn `cadastrarPessoaAcademia` (com `requireSupabaseAuth` + `autorizar`) chamando a RPC.
- Novo componente `src/components/partner/CadastrarPessoaAcademia.tsx` com o formulário e validação (nome mínimo, telefone com 10–11 dígitos, data válida e idade plausível).
- `src/components/partner/AcademiaTestePanel.tsx`: botão no topo da aba Registrar/Renovar, e ao concluir o cadastro renderiza `RenovarAluno` já apontando para a `credencialId` recém-criada.
