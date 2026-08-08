# Venda de Master Coach: comissão do coach titular está indo para o Master

## O que verifiquei (dados reais)

Pedido `PP-32C7696B` (Kátia vendeu o produto do Adriano para a Francisca, R$ 20,00, pago):

- Comissão de coach do produto: 50% → R$ 8,84 (base) / R$ 8,30 após rede.
- Bônus Master Coach para a Kátia: **R$ 5,81 = 70% de 8,30** — percentual correto, lido da configuração do Adriano (70%).
- **Erro 1:** os R$ 2,49 restantes (30%) foram creditados à **Kátia**, não ao Adriano. O Adriano recebeu **R$ 0,00** de comissão de coach nessa venda.
- **Erro 2:** a rede usada foi a da **Kátia** (upline dela em N1) e, como ela não tem N2/N3, os valores viraram "Comissão Direta (sem upline)" e também foram para a **Kátia** (+0,18 +0,09). A rede do Adriano não recebeu nada.
- Resultado: dos R$ 8,84, a Kátia ficou com R$ 8,57 e o Adriano com R$ 0,00.
- **Erro 3 (rótulo):** o pedido grava `titular_coach_id` = Kátia no histórico, quando o titular é o Adriano.

O que **está correto** hoje:
- Percentual master (70% configurável, sem valor fixo) e cálculo do valor.
- Líquido do profissional (Adriano): R$ 8,84 por venda, carteira profissional com R$ 35,36 pendentes em 4 vendas pagas — bate exatamente.
- Taxas, imposto, taxa de sistema e o valor bruto conferem com o motor financeiro.
- Carteiras somam o que foi lançado (o problema é o destinatário do lançamento, não a soma).

Comparação com a venda direta do Adriano (`PP-44E1B4B7`): coach 8,30 para o Adriano + 0,27/0,18/0,09 para a rede dele. É esse o resultado esperado também na venda da Kátia, menos os 70% do master.

## Correção proposta

1. **Titular correto na criação do pedido** (`create_partner_product_order` / `..._checkout`): em venda de Master Coach para aluno de outra rede, gravar
   - `selling_coach_id` = coach titular do aluno/produto (Adriano) — quem recebe a comissão de coach,
   - `master_coach_cross_beneficiary_coach_id` = Kátia (só o bônus),
   - uplines N1/N2/N3 = uplines do **titular**,
   - `metadata.master_cross_sale.titular_coach_id` = titular real, `seller_coach_id` = master.
   Se ainda for necessário registrar quem operou a venda, isso continua em `metadata.created_by_coach_id`.
2. **Sem fallback "Comissão Direta (sem upline)" para o master**: quando o titular não tem N2/N3, esses valores seguem a regra atual do titular (não podem cair na carteira do master).
3. **Distribuição paga**: no gatilho que gera as comissões do pedido, garantir que o nível 0 vá para o titular e o registro `is_master_coach_commission` para o master, evitando dupla contagem com `apply_master_cross_sale_split` (que hoje só cobre pedidos de loja, não pedidos de parceiro/profissional).
4. **Correção retroativa** do pedido `PP-32C7696B`: transferir 2,49 (nível 0) para o Adriano, 0,27 para a upline N1 do Adriano, 0,18 N2, 0,09 N3, remover os lançamentos "sem upline" da Kátia, mantendo os 5,81 dela. Depois rodar a reconciliação de carteiras.
5. **Relatórios**: nas telas de venda/extrato mostrar as três linhas separadas — "Comissão do coach titular", "Bônus Master Coach (x%)" e "Rede N1/N2/N3" — com o nome do beneficiário, para que a divergência fique visível de imediato.

## Validação

- Nova venda de teste da Kátia para um aluno do Adriano: conferir 2,49 Adriano / 5,81 Kátia / 0,27-0,18-0,09 rede do Adriano / 8,84 carteira profissional do Adriano.
- Conferir carteira da Kátia (pendente cai de 8,57 para 5,81 na venda corrigida) e a do Adriano (sobe 2,49).
- Revisar as demais vendas master pagas com a mesma consulta e aplicar o mesmo acerto, se houver.
