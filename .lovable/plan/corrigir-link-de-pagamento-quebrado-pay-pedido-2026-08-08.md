# Corrigir link de pagamento quebrado (/pay/pedido)

## Diagnóstico (confirmado)

O link enviado ao cliente é montado no app com o número do pedido: `.../pay/PP-XXXXXXXX`. Quando o app não consegue ler esse número, o código usa o texto genérico `"pedido"` como reserva — foi exatamente isso que gerou `https://fitmindclub.com.br/pay/pedido` e a tela "Pedido não encontrado".

Por que o número não foi lido:
- Depois de criar a venda, a tela busca o pedido de volta na base para pegar o número.
- As regras de acesso da tabela de pedidos liberam a leitura para o aluno dono do pedido, para o parceiro e para coaches ligados à venda; quando o vendedor não se encaixa nessas regras (caso típico do master coach vendendo para um cliente de outra rede), a busca volta vazia.
- Com a busca vazia, o código cai no texto `"pedido"` e o link sai quebrado. Confirmado no banco: os pedidos da Francisca existem e têm número válido (ex.: `PP-...`), ou seja, o problema é só de leitura no app, não de criação.

## Correção

1. Nova função de servidor `resolveOrderNumber` (`src/lib/order-number.functions.ts`): recebe o tipo e o id do pedido, exige usuário autenticado e devolve o número e o valor lidos com privilégio de servidor. Isso remove a dependência das regras de leitura da tabela para montar o link.
2. Usar essa função como reserva nos pontos que hoje caem em `"pedido"`:
   - `src/components/student/StorePage.tsx` (3 pontos: compra do aluno, compra de produto de parceiro/profissional e venda feita pelo coach)
   - `src/components/store/PartnerProfessionalStore.tsx` (1 ponto)
3. Eliminar o texto `"pedido"` como reserva. Se ainda assim o número não vier, o bloco "Link de pagamento do cliente" não é exibido e aparece um aviso curto ("Número do pedido indisponível, recarregue a tela"), em vez de gerar um link quebrado.
4. Nenhuma mudança em preço, comissão, regras de venda ou banco de dados.

## Validação

- Refazer uma venda como master coach para uma cliente de outra rede e conferir que o link copiado/WhatsApp contém o número real (`/pay/PP-...`) e abre a tela de pagamento.
- Abrir `/pay/PP-...` de um pedido existente da Francisca e confirmar que carrega normalmente.
