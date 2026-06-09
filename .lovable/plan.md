Plano de correção

Problemas encontrados
- A carteira do indicador está somando todas as comissões da venda indicada, incluindo coach/upline/vendedor. Por isso aparece R$ 73,07; o correto para o aluno indicador nesse produto é só a linha “aluno indicador” de R$ 40,00.
- O cartão “Minhas indicações” conta apenas alunos cadastrados com `referred_by_student_id`. Quando uma compra é feita por link por um aluno já logado/cadastrado, a comissão aparece, mas o contador de indicados continua 0.
- A venda real pelo Mercado Pago que você mostrou foi aprovada, mas o pedido de coach não tinha transação vinculada. A reconciliação marcou o pedido como pago, porém não havia transação para o motor financeiro distribuir comissões, relatórios e carteira.
- O modal “Indique e ganhe” ainda calcula/mostra comissão usando a regra antiga de percentual, em vez de ler a comissão configurada na aba Financeiro do produto.

O que vou implementar

1. Corrigir carteira de indicação do aluno
- Ajustar a função de recálculo da `student_wallets` para considerar somente comissões cujo beneficiário é o próprio aluno indicador.
- Excluir da carteira do aluno as linhas de coach, rede e vendedor mesmo quando a venda foi por indicação.
- Recalcular as carteiras já existentes para corrigir o saldo de R$ 73,07 para o valor real devido ao indicador.

2. Corrigir “Minhas indicações” no perfil do aluno
- Fazer o card e o modal usarem as comissões reais do indicador, não apenas cadastro de novos alunos.
- Exibir o total/contador mesmo quando o comprador já era aluno e apenas comprou pelo link de indicação.
- Filtrar o modal para mostrar somente comissões pagas ao aluno indicador.

3. Corrigir vendas reais Mercado Pago sem distribuição
- Ajustar o processamento de pedido pago para, quando o pedido ainda não tiver transação, criar a(s) transação(ões) a partir dos itens do pedido antes de processar comissões.
- Garantir que `applyApproval`, webhook, polling e reconciliação chamem o mesmo caminho completo: pedido pago → transação paga → comissões → carteiras → relatórios.
- Reprocessar pedidos Mercado Pago já aprovados que ficaram sem transações/comissões, incluindo a venda real que você reconciliou.

4. Corrigir comissão exibida no “Indique e ganhe”
- Trocar o cálculo antigo por percentual pela leitura dos slots financeiros do produto.
- Para produto com slot `referral_student` fixo em R$ 40, mostrar R$ 40,00.

5. Validação
- Conferir no banco que a venda aprovada gera transação e comissões.
- Conferir que a carteira do indicador soma somente R$ 40,00 pendente/disponível conforme status.
- Conferir que relatórios e painel financeiro passam a listar as comissões geradas.
- Conferir que Mercado Pago futuro aprovado entra automaticamente sem precisar reconciliar manualmente.