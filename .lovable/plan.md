## O que foi verificado

1. **Erro na venda coach → aluno** — confirmado no banco: existem **duas versões** da função `create_partner_company_order`, ambas com parâmetros opcionais:
   - `(_partner_product_id, _student_id, _payment_method)` (antiga)
   - `(_partner_product_id, _student_id, _payment_method, _referred_by_student_id)` (atual, mais completa: indicação por aluno, FitCoin, cross-sale Master)
   
   Quando a tela do coach chama com apenas 3 parâmetros, o Postgres não consegue escolher entre as duas e devolve exatamente a mensagem do print. A venda pelo painel do aluno funciona porque envia os 4.

2. **Estoque** — o produto "Aulão de Jump" tem `estoque = 25` e `capacidade do evento = 25`, mas **nenhuma das duas funções lê ou desconta o estoque**, e não há nenhum gatilho de estoque na tabela de pedidos de parceiro. Ou seja: hoje o estoque é só um número exibido; é possível vender além dele. Não é um bug de tela, é regra que nunca existiu para produtos de parceiro.

3. **Link `/r/T93FNN?p=...`** — a rota resolve o código e guarda o produto, mas:
   - Se o usuário **já está logado como aluno**, ela navega para a loja **ignorando o produto**.
   - Na loja, a abertura automática do produto só acontece para produtos FitMind; para produto de **parceiro/profissional** ela apenas troca de aba e nunca abre o detalhe.
   - Depois do **cadastro/login**, o fluxo cai em `/portal-selector` e o produto pendente se perde.

## Correções propostas

### 1. Venda coach → aluno (uma migration só)
Remover a função antiga de 3 parâmetros (`DROP FUNCTION public.create_partner_company_order(uuid, uuid, text)`), deixando apenas a versão completa. Ela já cobre todos os casos, pois o 4º parâmetro tem valor padrão.
Além disso, no frontend, passar `_referred_by_student_id` explicitamente na chamada da venda do coach (`StorePage.tsx`), para que nunca mais dependa de resolução por assinatura.

### 2. Estoque funcionando e comprovável
Migration própria, alterando somente a função atual (mesma assinatura e mesmo retorno):
- Antes de criar o pedido: se o produto tem estoque definido, contar pedidos já existentes (pendentes + pagos) daquele produto e **recusar a venda com mensagem clara** quando o limite for atingido ("Produto esgotado — restam 0 de 25 vagas").
- Bloqueio com `SELECT ... FOR UPDATE` na linha do produto, para dois coaches não venderem a última vaga ao mesmo tempo.
- Sem alterar nenhum cálculo financeiro.

Na tela: mostrar "X de 25 restantes" no card e no modal do produto de parceiro (loja do aluno, loja pública e venda do coach) e desabilitar o botão quando zerar.

Como comprovar: painel do parceiro/admin passa a mostrar vagas usadas x total, e uma venda além do limite é recusada com a mensagem acima.

### 3. Link do produto sobreviver ao login e ao cadastro
- Em `/r/{code}`: se o link tem `?p=`, o produto vira o destino em todos os casos — inclusive para quem já está logado (hoje só vai para a loja).
- Guardar o produto pendente em `localStorage` (junto da atribuição durável, que já existe), não só em `sessionStorage`, para sobreviver ao cadastro, à confirmação de e-mail e ao redirect do Google.
- Após login/cadastro, quando houver produto pendente, mandar direto para a loja do aluno com aquele produto aberto, em vez de `/portal-selector`.
- Na loja: abrir o modal de detalhe também para produtos de **parceiro e profissional** (hoje só troca de aba), e limpar o pendente depois de abrir.
- Loja pública `/loja?produto=`: manter o produto marcado, e depois do cadastro reabrir esse mesmo produto já logado, pronto para comprar.

## Ordem de execução
1. Migration A: remover a função duplicada → venda do coach volta a funcionar (teste imediato).
2. Ajuste de frontend da chamada.
3. Migration B: regra de estoque + telas mostrando vagas restantes.
4. Ajustes de link/atribuição e abertura automática do produto.
