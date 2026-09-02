# Tornar Pagamentos uma fonte financeira única e auditável

## Diagnóstico confirmado

O problema não é uma tabela que deixou de existir; são caminhos concorrentes e uma seleção incorreta de cadastro:

- Fernando possui **dois registros aprovados em `partners`**. As 42 vendas pagas estão no registro antigo, mas `recalc_wallets_for_owner` usa `SELECT ... LIMIT 1` sem ordenação e recalcula apenas um parceiro. Quando escolhe o registro novo, sem vendas, a carteira correta fica desatualizada.
- Nas vendas do Fernando, o banco contém hoje **R$ 847,85 de líquido bruto do criador**, **R$ 424,05 de repasses de co-produção** e **R$ 423,80 líquidos esperados para ele**. A carteira de parceiro registra apenas **R$ 258,04**, deixando de incorporar **R$ 165,76 pendentes** das vendas recentes.
- As comissões existem: **R$ 29,25 pendentes** e **R$ 41,98 liberadas**. Portanto, elas não deixaram de ser geradas; a divergência está na leitura/agregação da aba.
- O co-produtor Leandro possui **R$ 165,76 pendentes** nas vendas recentes, e esse valor está na carteira profissional. A projeção de Contas a Pagar não o mostra porque consulta apenas `commissions`.
- `getPayablesReport` lê saldos gravados diretamente e sua projeção considera somente `commissions`; não inclui `partner_product_orders` nem `product_coproduction_credits`.
- A aplicação chama `recalc_wallet_for_profile`, que recalcula apenas a carteira principal, enquanto rotinas administrativas usam `recalc_wallets_for_owner`, que também trata parceiro e profissional. Essa duplicidade permite que o erro volte.
- A última auditoria global registrada foi em **19/08/2026**, anterior às vendas recentes.

## 1. Corrigir e reconciliar os dados atuais

- Recalcular Fernando considerando **todos** os registros de parceiro e profissional vinculados ao perfil, sem `LIMIT 1`.
- Gravar corretamente:
  - Fernando: produto criado liberado e pendente, descontando a co-produção por pedido;
  - Leandro: créditos de co-produção liberados e pendentes;
  - comissões do Fernando: carência separada do disponível.
- Auditar todos os perfis com cadastros duplicados de parceiro/profissional e reconciliar somente os que apresentarem diferença.
- Preservar os registros históricos e vínculos dos pedidos; não excluir cadastros duplicados sem antes mapear todas as referências.

## 2. Criar um único extrato financeiro no banco

Criar uma função tabular de lançamentos financeiros que derive tudo dos eventos reais, com uma linha por origem e beneficiário:

- comissão de venda/rede;
- líquido de produto criado;
- débito de co-produção do criador;
- crédito de co-produção do colaborador;
- pagamento com carteira;
- saque solicitado/aprovado/pago;
- adiantamento e compensação.

Cada lançamento terá beneficiário por `profile_id`, origem, referência, valor, estado (`carência`, `rede bloqueada`, `disponível`, `reservado`, `pago`) e data de liberação. O cálculo deverá agregar **todos** os IDs de parceiro, coach e profissional pertencentes à pessoa e deduplicar por referência.

`wallet_statement`, `wallet_statement_bulk`, recálculo das carteiras, Pagamentos e Contas a Pagar passarão a consumir esse mesmo extrato. Não haverá mais fórmulas paralelas em TypeScript para produto criado/co-produção.

## 3. Eliminar os caminhos concorrentes de recálculo

- Transformar `recalc_wallet_for_profile` em compatibilidade delegando para a função oficial completa, ou substituir todos os chamadores por uma única função canônica.
- Corrigir triggers de comissões, pedidos pagos, créditos de co-produção, saques e pagamentos com carteira para acionarem o mesmo recálculo.
- Remover `LIMIT 1` na resolução de parceiro/profissional e trabalhar com o conjunto de IDs vinculados ao perfil.
- Garantir idempotência: rodar duas vezes produz exatamente os mesmos saldos e não duplica lançamentos.

## 4. Refazer Pagamentos e Contas a Pagar sobre a fonte única

- Lista por pessoa, cartões, modal, filtros e CSV usarão `wallet_statement_bulk`/extrato oficial.
- A projeção “a liberar” incluirá:
  - comissões em carência;
  - produto criado líquido após co-produção;
  - crédito recebido pelo co-produtor;
  - data real de liberação de cada pedido.
- Exibir separadamente no detalhamento: **Comissões**, **Produto criado**, **Co-produção recebida**, **Rede bloqueada**, **Saque reservado** e **Pago**.
- Uma pessoa não desaparecerá por ter carteira gravada zerada quando existirem lançamentos pendentes no extrato.
- Manter Fitcoin separado do financeiro profissional.

## 5. Auditoria automática e proteção contra regressão

- Ampliar “Conferir todas as carteiras” para comparar cada carteira gravada com o extrato oficial, incluindo parceiro, profissional e co-produção.
- Registrar diferenças por pessoa, origem e referência, não apenas o delta final.
- Mostrar alerta no admin quando houver divergência, cadastro financeiro duplicado ou lançamento sem carteira correspondente.
- Adicionar testes de regressão para:
  - pessoa com dois registros de parceiro;
  - criador com co-produção 50%;
  - co-produtor parceiro e profissional;
  - vendas antes/depois da carência;
  - comissão + produto criado no mesmo perfil;
  - rede bloqueada por missão;
  - saque reservado/pago e pagamento com carteira;
  - execução repetida sem alteração de saldo.

## 6. Validação final

Conferir no banco e na interface:

- Fernando: **R$ 29,25 de comissões em carência** e **R$ 165,76 de produto criado em carência**, além dos valores já liberados, sempre com o desconto de co-produção por pedido.
- Leandro: **R$ 165,76 de co-produção em carência** das vendas recentes.
- Os mesmos totais em Dashboard de Pagamentos, lista por pessoa, modal, Contas a Pagar, projeção e painéis dos beneficiários.
- Auditoria global sem diferenças após a reconciliação.
- Rodar a verificação TypeScript obrigatória e aceitar somente os 15 erros preexistentes nos caminhos documentados, sem regressão nova.

## Detalhes técnicos

- Nova migration versionada com a função de lançamentos, recálculo canônico, wrappers compatíveis e triggers; nenhuma alteração direta no banco sem arquivo correspondente.
- Atualizar `admin-payables.functions.ts`, `admin-payouts.functions.ts` e `wallet-statement.functions.ts` para remover somas próprias.
- Atualizar `docs/contexto` com a fonte oficial, invariantes e procedimento de auditoria para impedir futuras migrations de sobrescreverem parcialmente o financeiro.
