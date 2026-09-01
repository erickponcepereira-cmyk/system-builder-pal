-- CPF na credencial da academia.
--
-- A credencial já guarda `telefone` e `nascimento` — os dois dados que a
-- recepção usa para saber que a Maria da frente é a Maria da lista. Faltava o
-- CPF, que é justamente o identificador que a academia usa quando o nome
-- repete: "Carlos Eduardo Alves" e "Carlos Eduardo Rocha" são duas pessoas, e
-- o telefone da família pode ser o mesmo.
--
-- POR QUE ISSO APARECE AGORA. Na Estação as credenciais nasceram do leitor
-- facial, que só sabe nome e identificador — CPF nunca esteve na origem. A
-- academia do Jean não tem catraca: o cadastro dela nasce da lista de clientes
-- do sistema antigo, e essa lista TEM CPF. Sem coluna, a importação teria que
-- jogar fora 52 dos 59 CPFs.
--
-- O CPF também já é chave em outro ponto do domínio: `academia_dayuse_avaliar`
-- e `academia_dayuse_registrar` recebem CPF, e `academia_cpf_hash` existe para
-- guardar day-use sem gravar o número cru. Aqui o número fica cru de propósito:
-- é cadastro de aluno da unidade, não visitante anônimo, e a recepção precisa
-- LER o CPF para conferir com o documento na mão.
--
-- Sem UNIQUE. A lista real do Jean chega com três CPFs que não passam no
-- dígito verificador e sete pessoas sem CPF nenhum; uma restrição aqui
-- transformaria erro de digitação do sistema antigo em falha de importação, e
-- o objetivo é trazer a operação como ela é para depois limpar.

ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS cpf text;

COMMENT ON COLUMN public.academia_credenciais.cpf IS
  'CPF do aluno como veio do cadastro da academia, so digitos. Sem unique: a origem tem CPF invalido e ausente, e importacao nao pode quebrar por isso.';

-- Busca por CPF na recepção: a pessoa chega, fala o número, a recepção acha.
CREATE INDEX IF NOT EXISTS academia_credenciais_cpf
  ON public.academia_credenciais (partner_id, cpf)
  WHERE cpf IS NOT NULL;
