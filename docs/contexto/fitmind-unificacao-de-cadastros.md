---
name: fitmind-unificacao-de-cadastros
description: "Como dois cadastros da mesma pessoa viram um: o que admin_merge_profiles faz, o furo de segurança que tinha, e por que o recálculo de carteira espera"
metadata:
  node_type: memory
  type: project
---

Reescrita em 30/09/2026 depois de unificar as duas contas da Lorayny (Gmail +
Apple), que precisou de complemento à mão. Ver [[fitmind-estorno-de-venda]] para
a lógica de carteira derivada.

**O destino é o cadastro que a pessoa usa** — o de acesso mais recente
(`profiles.last_app_login_at`, mais confiável que `auth.users.last_sign_in_at`:
login pela Apple renova sessão sem registrar login novo). A tela mostra o
último acesso e avisa quando o destino é mais antigo que a origem.

## O que `admin_merge_profiles` faz

- Religa **toda FK de coluna única** que aponta para o aluno, o coach ou o perfil
  da origem — inclusive dentro de `students`, `coaches` e `profiles`, que antes
  ficavam de fora (por isso os alunos do coach ficavam na conta antiga). As
  próprias linhas de aluno/coach/perfil das duas contas não são religadas.
- Conflito de chave única: move linha a linha o que couber; só o que conflita
  fica na origem (`skipped`). Carteiras sempre caem aqui — são derivadas e
  recalculadas no fim.
- Empresa parceira: `guard_partner_members_owner` só deixa trocar o dono com
  `is_admin(auth.uid())`. A função assume o JWT do admin responsável
  (`p_actor`), porque pela tela o `auth.uid()` é nulo (service role).
- Mensalidade: se o destino tem a dele, a da origem é cancelada com as faturas
  em aberto; senão, passa para o destino.
- Sobra da origem: coach sem alunos nem equipe é **bloqueado**; aluno sem
  nenhuma ligação e com carteira zerada é **removido**.
- Login: identidades Apple/Google da origem passam para o usuário do destino
  (ela entra pelos dois jeitos na mesma conta); sessões da origem são
  encerradas; se sobrar login por e-mail, o usuário da origem é banido e a
  tela avisa para orientar a pessoa.

**A simulação executa tudo de verdade e desfaz no fim** (`RAISE ... 'P0099'`).
O resumo é o que a real vai fazer, inclusive o erro. A tela só libera
"Mesclar definitivamente" depois de simular a mesma dupla sem erro.

## Armadilhas que custaram tempo

- **Era aberta para qualquer usuário logado.** SECURITY DEFINER, EXECUTE para
  `authenticated`, sem checar quem chamava: dava para unificar a conta de outra
  pessoa na própria e levar comissões, alunos e empresa. Agora só admin, e o
  EXECUTE é só de `service_role`.
- **PostgREST corta em 8 s** (`authenticator` tem `statement_timeout=8s`, e
  `service_role` não sobrescreve). Cada comissão/saque/pedido religado disparava
  um recálculo de carteira (0,3–0,5 s): a conta da Tatiane levava mais de 20 s,
  e pela tela falharia por tempo. Os cinco gatilhos de recálculo
  (`commissions_sync_wallet`, `withdrawal_requests_sync_wallet`,
  `trg_recalc_on_withdrawal`, `trg_recalc_on_product_order`,
  `trg_recalc_buyer_wallet_on_wallet_order`) retornam cedo quando
  `fitmind.recalculo_adiado = 'on'`, e a unificação recalcula as duas contas
  uma vez no fim. Caiu para 1,2 s.
- **`SET LOCAL statement_timeout` dentro de um DO não vale para o próprio DO** —
  o relógio já está correndo. Para limitar um teste pelo MCP, `SET` antes, na
  mesma chamada.
- **Teste destrutivo em produção:** dentro de um `DO` que termina em
  `RAISE EXCEPTION` com os resultados na mensagem. Nada grava, e o MCP devolve o
  texto como erro. Se o MCP der 499, o comando continua no banco — confira o
  estado antes de repetir.

## Backup antes de mexer à mão

Existe o schema `backup` (fora do PostgREST, sem acesso de `anon`/`authenticated`).
Antes de uma correção manual grande, copie as linhas em `to_jsonb` para uma
tabela lá — foi o que permitiu desfazer com segurança a unificação da Lorayny
(`backup.unificacao_lorayny_20260930`) e o reembolso do desafio
(`backup.reembolso_desafio_20260930`).
