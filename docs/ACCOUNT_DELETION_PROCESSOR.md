# Processador de exclusão de conta

Este documento descreve a implantação operacional do processador de exclusão do FitMind Club. Ele não contém chaves nem valores de produção.

## Componentes

- Fila e estado de processamento: `account_deletion_requests`.
- Auditoria sanitizada: `account_deletion_attempts`.
- Migration: `20260831215900_account_deletion_processor.sql`.
- Worker: `src/lib/account-deletion-processor.server.ts`.
- Endpoint privado: `POST /api/public/hooks/account-deletion`.
- Congelamento/claim atômico de cobranças: funções `account_deletion_freeze_billing` e `account_deletion_claim_recurring_charge`.

O endpoint só aceita um bearer secret dedicado com pelo menos 32 caracteres. Ele não aceita chave anônima, JWT de usuário ou parâmetros por query string.

## Ordem obrigatória de implantação

1. Criar backup verificável do banco e ensaiar a restauração.
2. Confirmar que o histórico remoto de migrations corresponde ao repositório e aplicar, na ordem dos nomes, todas as migrations pendentes da `main` até `20260831200000_reserva_de_aula_e_qr_da_mensalidade.sql`.
3. Aplicar, também na ordem dos nomes, as migrations preparatórias desta release: `20260831210000_account_deletion_requests.sql`, `20260831211000_disable_public_test_accounts.sql`, `20260831212000_push_notification_audit.sql`, `20260831213000_secure_public_payment_links.sql` e `20260831214000_ugc_moderation.sql`.
4. Pausar temporariamente o cron de recorrências e colocar criação/cancelamento de recorrências em manutenção.
5. Aplicar `20260831215900_account_deletion_processor.sql` em staging. Todo o conjunto foi colocado depois da base Lovable atual para não ser tratado como migration retroativa. Ela depende das tabelas UGC da etapa anterior e torna as gravações de recorrência exclusivas do backend; por isso migrations e backend devem entrar na mesma janela.
6. Publicar imediatamente o backend que contém o worker e o claim atômico de recorrências.
7. Configurar `ACCOUNT_DELETION_PROCESSOR_SECRET` e `INTERNAL_CRON_SECRET` diretamente no ambiente do backend.
8. Guardar os mesmos valores no secret manager/Vault usado pelo agendador. Nunca inserir valores em migration, Git, log ou chat.
9. Atualizar todos os jobs internos conforme `docs/INTERNAL_CRON_SECURITY.md` e só então reativá-los.
10. Agendar uma chamada horária para o endpoint de exclusão com `Authorization: Bearer <secret>` e corpo `{"limit":3}`.
11. Executar primeiro todos os testes de staging abaixo.

O worker só reserva solicitações cujo `due_at` já venceu. Uma lease expira após 20 minutos e pode ser recuperada por outra execução. Falhas temporárias usam backoff; depois de cinco tentativas a solicitação fica bloqueada para intervenção.

## Reprocessamento controlado

Uma solicitação bloqueada pode ser liberada somente pelo endpoint privado e com ID explícito:

```json
{
  "requestId": "00000000-0000-4000-8000-000000000000",
  "retryBlocked": true,
  "limit": 1
}
```

Antes de reprocessar, resolver o código registrado em `last_error_code`:

- `MASTER_ADMIN_TRANSFER_REQUIRED`: transferir a função de master admin.
- `FINANCIAL_SETTLEMENT_REQUIRED`: concluir/rejeitar saques e zerar saldos liberados ou pendentes.
- `PAYMENT_RECONCILIATION_REQUIRED`: aguardar/conciliar cobrança em análise, claim de cobrança ou criação externa ainda em andamento.
- `COACH_STUDENT_TRANSFER_REQUIRED`: transferir alunos ativos para outro coach.
- `PARTNER_OWNERSHIP_TRANSFER_REQUIRED`: transferir ou remover os demais membros da unidade.
- `MP_NOT_CONFIGURED` ou `MP_CONFIGURATION_INVALID`: corrigir a credencial Mercado Pago.
- `MP_PREAPPROVAL_OWNERSHIP_MISMATCH`, `MP_CUSTOMER_OWNERSHIP_MISMATCH` ou `MP_CARD_OWNERSHIP_MISMATCH`: não reprocessar antes de auditar o vínculo local e o recurso no Mercado Pago.
- Erros de Storage, Auth ou indisponibilidade externa: confirmar a recuperação do serviço antes de liberar manualmente.

## Garantias do fluxo

- O processador antigo `admin_purge_user_dependents` não é utilizado.
- Master admin, saldos, saques e vínculos que exigem transferência bloqueiam o processo antes de qualquer remoção.
- Cobranças pendentes/em processamento e criação externa em andamento bloqueiam o processo antes do banimento.
- O plano externo é validado contra `external_reference` e e-mail do pagador antes do congelamento; IDs locais nunca são aceitos como prova de propriedade por si só.
- As recorrências são congeladas atomicamente antes de a identidade ser banida; o cron reserva cada cobrança com compare-and-set e não pode atravessar esse congelamento.
- Preapprovals e cartões são confirmados como removidos no Mercado Pago antes do vínculo local.
- O grant Google Calendar é revogado antes da remoção do token local.
- O manifesto de arquivos é paginado; Storage, inclusive evidências UGC privadas, é varrido e verificado antes e depois da remoção do Auth.
- Dados de saúde, localização e mensagens do titular são apagados explicitamente.
- Pedidos e totais financeiros são preservados sem nome, documento, e-mail, endereço, payload bruto ou vínculo com o Auth original.
- Perfil, aluno, coach e parceiro viram registros-túmulo anonimizados para preservar chaves históricas sem manter acesso.
- A exclusão de `auth.users` usa exclusivamente a Admin API oficial; depois dela há um segundo passe idempotente de Storage/banco para fechar corridas de JWT já emitido.
- Um hash unidirecional com validade de 48 horas bloqueia escritas de JWTs antigos sem reter o UUID original no pedido concluído.
- Auditoria guarda apenas estágio, contadores e códigos estáveis; nunca e-mail, token, conteúdo ou payload de pagamento.

## Checklist de staging

1. Pedido ainda dentro do prazo não é reservado.
2. Pedido pode ser cancelado somente enquanto está em `queued`.
3. Master admin é bloqueado sem banimento ou alteração de dados.
4. Conta com saldo/saque pendente é bloqueada sem cancelamento externo.
5. Coach com aluno ativo e parceiro com outro membro são bloqueados.
6. Cobrança `processing`, `charging`, `external_creating` ou `pending_charge_id` bloqueia sem banir o usuário.
7. Corrida entre cron de cobrança e exclusão termina com apenas um vencedor: cobrança reservada ou conta congelada.
8. Conta simples sem recorrência conclui e não consegue mais autenticar.
9. Preapproval com `external_reference` ou pagador divergente bloqueia sem chamar cancelamento.
10. Preapproval válido é confirmado como `cancelled` no Mercado Pago.
11. Cartão só é removido após validar cliente/e-mail/cartão e deixa de existir no Mercado Pago e no banco.
12. Resposta vazia/malformada de preflight, anonimização ou Mercado Pago bloqueia o fluxo.
13. Falha 5xx/timeout do Mercado Pago não remove Storage, banco ou Auth.
14. Manifesto com mais de 1.000 objetos é paginado e todos os arquivos são removidos.
15. Arquivo criado durante o primeiro passe é removido no passe pós-Auth; novo upload por JWT antigo é negado.
16. Foto, evolução, alimento e mídia de grupo deixam de existir no Storage.
17. Mensagens ficam sem conteúdo/mídia e o perfil-túmulo não contém PII.
18. Pedidos pagos preservam valores, mas não endereço, nome, telefone, metadata ou token público anterior.
19. Falha depois da exclusão do Auth consegue retomar e concluir a auditoria usando `subject_user_id`.
20. Duas execuções simultâneas nunca processam a mesma lease; operações longas renovam o heartbeat.
21. `account_deletion_attempts` não contém dados pessoais.
22. Após aplicar a migration, recorrências, cartões e login Google continuam funcionando nos fluxos normais.
23. Grupos de WhatsApp pertencentes ao parceiro/profissional excluído são removidos e deixam de expor telefone ou convite.
24. Aceites, bloqueios e recursos UGC são eliminados; denúncias e ações preservadas ficam sem vínculo pessoal nem campos públicos do perfil.
25. Arquivos em `ugc-evidence` vinculados ao titular aparecem no manifesto e são removidos antes da conclusão.

Somente depois desse checklist o cron de produção deve ser ativado.
