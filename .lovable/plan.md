## Contexto verificado no banco

A Faby tem duas contas de login distintas, com e-mails diferentes (por isso a checagem de e-mail existente não pegou):

| Conta | E-mail | Papel | Criada | Dados |
|---|---|---|---|---|
| A | fabyka29@outlook.com | aluno | 28/07 23:19 | 1 pedido **pago** + 1 transação paga |
| B | fabykatrine29@gmail.com | coach (liberado, anuidade paga 23:42) | 28/07 23:39 | também tem linha de aluno; 1 pedido **pendente** |

Ambas apontam para o mesmo coach patrocinador.

## Entrega 1 — Unificar a Faby na conta coach (gmail)

- Migrar da conta A para a conta B: pedidos/transações pagas, carteira, indicações, registros de aluno (peso, presença, agendamentos, resgates) e quaisquer alunos indicados.
- Manter o cadastro de aluno da conta B como o único ativo; consolidar o histórico nele.
- Desativar a conta A: marcar o perfil como inativo/mesclado, guardando o vínculo com a conta B para auditoria, e liberar o e-mail antigo para não conflitar.
- Conferência pós-migração: pedido pago aparece no histórico da conta gmail, carteira e rede batendo, e o login outlook não abre mais painel próprio (mensagem: "conta unificada, entre com o Google").

## Entrega 2 — Virar coach/parceiro/profissional de dentro da conta

- No painel do aluno (e no seletor de área), botão "Quero ser Coach / Parceiro / Profissional".
- O fluxo reaproveita o cadastro existente: pede só os dados que faltam (CPF/CNPJ, patrocinador, termos) e cria o papel **no mesmo perfil**, seguindo o mesmo gate de anuidade/pagamento de hoje.
- Nas telas públicas de cadastro de coach/parceiro/profissional: se a pessoa já estiver logada, em vez do formulário de conta nova, mostrar "Você já tem conta — adicionar este papel à sua conta".

## Entrega 3 — Bloquear duplicidade por CPF/telefone

- Ampliar a checagem atual (hoje só e-mail) para também verificar CPF/CNPJ e telefone já usados em outro perfil.
- Quando houver colisão: bloquear o envio e mostrar "Já existe uma conta com este CPF (e-mail f***@gmail.com). Entre nela e use 'Quero ser Coach'." com link para login.
- Reforço no banco: índice único (ignorando maiúsculas/pontuação) em CPF/CNPJ de perfis ativos, para impedir duplicidade mesmo por caminhos que passem direto pelo banco.

## Entrega 4 — Mesclagem de contas no admin

- Nova aba em Admin → Usuários → "Mesclar contas": busca por nome/e-mail/CPF, escolha da conta que fica e da que será absorvida, e prévia do que será movido (pedidos, carteira, rede, alunos, agendamentos).
- Execução server-side com verificação de admin, transferindo todos os vínculos e registrando um log de auditoria (quem mesclou, quando, contas envolvidas).
- Trava de segurança: não permite mesclar se ambas as contas tiverem cadastro de coach com rede própria com downline — nesse caso exige confirmação extra e informa a rede que será reanexada.

## Detalhes técnicos

- Migração SQL para: coluna `merged_into_profile_id` + status inativo em `profiles`, índice único de CPF/CNPJ, e função `admin_merge_profiles(source, target)` (security definer) que reatribui `students`, `store_orders`, `transactions`, `wallets`/`fitcoin_ledger`, `coaches.upline_coach_id`, agendamentos e reservas, e grava em `admin_audit_log`.
- Correção da Faby executada com a mesma função, para validar o caminho que o admin usará.
- Server functions novas em `src/lib/account-merge.functions.ts` (admin) e `src/lib/role-upgrade.functions.ts` (adicionar papel na própria conta), ambas com `requireSupabaseAuth`.
- Checagem ampliada em `src/lib/email-check.functions.ts` (identidade: e-mail + CPF + telefone) usada por `CoachRegistration`, `PartnerRegistration`, `ProfessionalRegistration` e `StudentRegistration`.
- O gate de pagamento/anuidade e o `PartnerOnboardingGate` continuam valendo para o papel adicionado — nada de liberar coach sem passar pelo fluxo atual.
