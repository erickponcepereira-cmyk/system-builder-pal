Plano de correção para o fluxo de produtos gratuitos com reserva e QR:

1. Corrigir a base de permissão no backend
- Ajustar as funções de reserva, cancelamento e leitura do QR para sempre converter o usuário logado no `profile_id` correto antes de comparar permissões.
- Corrigir as regras de leitura da tabela de reservas para que:
  - o aluno veja as próprias reservas;
  - o parceiro veja as reservas do próprio estabelecimento;
  - o admin continue podendo auditar.
- Manter QR único por reserva, mas sem liberar uso fora da janela de horário.

2. Regras de horário do QR
- A reserva poderá ser feita antes normalmente.
- O QR do aluno só aparecerá durante o horário reservado.
- Antes do horário: mostrar status como “QR liberado no horário da reserva”, sem exibir o código.
- Depois do horário: bloquear leitura e mostrar “produto fora do horário de utilização”; se ainda não usado, marcar como expirado.
- Na leitura pelo parceiro, remover a tolerância atual de 15 minutos antes do início e aceitar somente entre `slot_start` e `slot_end`.

3. Corrigir telas do aluno
- Corrigir `Minhas reservas`, que hoje filtra `profile_id` usando o ID de autenticação errado.
- Exibir cada reserva com status claro: aguardando horário, QR disponível, usado, cancelado ou expirado.
- Ao abrir uma reserva, mostrar o QR apenas quando estiver dentro da janela de uso; fora dela, mostrar mensagem e horário.
- Ao reservar com sucesso, atualizar imediatamente a lista para o aluno ver a reserva criada.

4. Corrigir painel do parceiro
- Reforçar o scanner para listar as reservas do parceiro por dia com aluno, produto, horário e status.
- Adicionar estados claros para “aguardando”, “disponível agora”, “confirmado”, “expirado” e “cancelado”.
- Após ler um QR, atualizar a lista imediatamente.
- Melhorar mensagens de erro do scanner para diferenciar: QR inválido, QR de outro parceiro, fora do horário, expirado e já usado.

5. Relatórios do parceiro
- Incluir reservas gratuitas no relatório do parceiro em vez de deixar `freebies_redeemed` fixo em zero.
- Adicionar aba/seção de reservas gratuitas com quantidade reservada, usada, cancelada e expirada no período.
- Exportar essas reservas no Excel junto com aluno, produto, horário, status e data de uso.
- Manter vendas pagas e carteira usando o fluxo financeiro existente, mas garantir que o relatório continue mostrando vendas pagas corretamente no mesmo período.

6. Validação final
- Testar o ciclo completo:
  - aluno reserva;
  - reserva aparece para o aluno;
  - reserva aparece no parceiro;
  - QR fica oculto antes do horário;
  - scanner bloqueia antes/depois do horário com mensagem correta;
  - scanner confirma dentro do horário;
  - relatório do parceiro contabiliza a reserva usada;
  - vendas pagas continuam aparecendo em relatórios/carteira.