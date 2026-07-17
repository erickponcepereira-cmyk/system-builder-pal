## Objetivo

Fechar duas frentes de diagnóstico da conta da Ana Flávia Lucas (`profile 7deffbca-e043-40cb-b3cc-6ed82c242f7d`):

1. Eliminar o resíduo de **R$ 9,06** que aparece como pendente na carteira principal mas não corresponde a nenhuma comissão real.
2. Localizar de onde vem a tag **"encaminhamento pendente"** ligada ao nome dela — já confirmado que ela **não é** profissional atribuída em nenhuma venda.

Sem mudanças de UX/produto: apenas conciliação de dados + rastreio da origem visual da tag.

## Situação atual (verificada no banco)


| Carteira     | Disponível | Pendente  | Total ganho | Sacado |
| ------------ | ---------- | --------- | ----------- | ------ |
| Principal    | 105,51     | **70,55** | 226,62      | 50,56  |
| Parceiro     | 3,50       | 0,00      | 3,50        | 0,00   |
| Profissional | 2,48       | 0,00      | 2,48        | 0,00   |


Decomposição do pendente principal (comissões reais):

- Referral pendente: **R$ 40,00** (venda `113aaaa5…` — Alcinata Pimenta, Ticket Desafio, libera 20/07/2026)
- Rede bloqueada por missão (níveis 1-3): **R$ 21,49**
- Soma explicada: **R$ 61,49**
- **Diferença sem lastro: R$ 9,06**

Encaminhamentos profissionais atribuídos a ela: **0** linhas em `transaction_professional_assignments`.

## Passos

### 1. Reconciliar os R$ 9,06

- Rodar `SELECT recalc_wallets_for_owner('<profile_id_da_ana>')` via migration (a função já existe).
- Reconferir `wallets`, `partner_wallets`, `professional_wallets` da Ana — o esperado é `pending_balance = 61,49` e `available_balance` refletindo `165,13 - 50,56 = 114,57`.
- Se o resíduo persistir após o recalc, inspecionar o corpo de `recalc_wallet_for_profile` procurando qualquer bucket adicional (ex.: comissões master, splits, ordens de parceiro em outro status) que esteja somando no pending sem cair no available correspondente. Corrigir o bucket com uma migration de ajuste na função. Nenhuma alteração de UI.

### 2. Investigar a tag "encaminhamento pendente"

- Buscar no código as strings `"Encaminhamento pendente"`, `"encaminhamento"` e `professional-assignment` para achar em qual painel/card ela aparece.
- Confirmar em qual query o componente popula essa lista — a hipótese é que o painel esteja mostrando encaminhamentos **das vendas em que a Ana é compradora/aluna** (perspectiva errada), quando deveria mostrar apenas encaminhamentos em que ela é o profissional atribuído.
- Se confirmado, ajustar o filtro do componente para `assigned_coach_id = <coach da ana>` em vez de `student_id = <ana>` (ou análogo).

### 3. Validação

- Após o recalc: conferir novamente as três carteiras e o painel admin de pagamentos da Ana e ja fazer o mesmo com todos os outros cadastros para verificar se estão corretos e corrigir todo o processo para isso nao ocorrer novamente de divergir informações.
- Após o ajuste do filtro: abrir o painel onde a tag aparecia e confirmar que sumiu para a Ana e continua correta para profissionais que realmente têm encaminhamentos.

## Fora de escopo

- Nenhum reprocessamento de comissões passadas.
- Nenhuma mudança em regras de missão, holdback de 7 dias ou percentuais.
- Nada que afete outros usuários além da conciliação global provocada pela migration (se necessária).