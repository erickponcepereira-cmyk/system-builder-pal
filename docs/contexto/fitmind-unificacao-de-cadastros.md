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

## A unidade parceira e a armadilha do caso Emmily (03/10/2026)

**`UPDATE partners SET profile_id = destino` traz a unidade da conta morta para
o perfil que fica — e isso costuma esconder a unidade de verdade.** Quase todo o
app escolhe assim: `plist.find(status === "approved") ?? plist[0]`, com
`order by created_at asc` (`partner-sales`, `partner-reports`,
`master-commission`, `herbalife-boletos`, `partner_.orders-in-progress`). A
unidade duplicada costuma ser a **mais antiga**, entao vira a escolhida. Outros
pontos pegam `limit(1)` sem ordem nenhuma (`annual-activation`, `coach-modal`,
`challenge-tokens`, `portal-selector`, `student.index`), e ai e sorteio.

Na Emmily as duas unidades tinham o mesmo CNPJ e as duas estavam `approved`: a
que ficou com tudo (2 produtos, 16 cupons, a colaboradora Marcia, ativacao de
R$ 179,90 paga) e a vazia, cinco minutos mais velha. Depois da unificacao,
**devolva a unidade duplicada para o perfil morto** e deixe `status='blocked'`
com `blocked_at` e `blocked_reason` — e o mesmo tratamento que a funcao ja da ao
coach da origem. Para mexer no dono em `partner_members` e preciso admin no JWT
na mesma transacao:

```sql
select set_config('request.jwt.claims',
       json_build_object('sub','<user_id do admin>','role','authenticated')::text, true);
```

Sem isso, `guard_partner_members_owner` derruba o UPDATE. Nos gatilhos de
`partners` nao ha susto: ao voltar para o perfil morto,
`apply_student_coach_to_new_panel` nao acha aluno (a funcao ja o removeu) e
`mirror_partner_as_coach` so faz `COALESCE` no coach que ja existe — nao
desbloqueia nada.

**`network_unlock_history` fica pela metade.** O `coach_id` migra e o
`profile_id` bate no unico por mes e fica na origem: sobram linhas com coach de
um lado e perfil do outro. Quando sao retratos zerados do mesmo mes que o
destino ja tem, e melhor apagar.

**A terceira copia pode nao estar em `profiles`.** A coach da Emmily tinha
aberto na mao, em 18/05/2026, a ficha "Emmily Costa Ventura" com tres avaliacoes
de 2024/2025, solta de qualquer login — a Emmily nunca viu essas avaliacoes no
app, e a coach via duas Emmilys na lista. Ao procurar duplicata de alguem, olhe
tambem `coach_evaluation_clients` por nome, nascimento e WhatsApp, nao so por
`profile_id`. Para juntar: `coach_body_assessments` passa para a ficha que tem
`student_id` (ha unico parcial em `coach_evaluation_clients.student_id`), e a
ficha velha sai.

**Como achar tudo o que esta preso numa conta**, sem depender de FK declarada —
varre toda coluna `uuid` do schema:

```sql
select table_name, column_name,
  array_to_string((xpath('//c/text()', query_to_xml(format(
    'select %1$I::text || '' x'' || count(*)::text as c from public.%2$I
      where %1$I = any(%3$L::uuid[]) group by %1$I',
    column_name, table_name, '{<id1>,<id2>}'), false, false, '')))::text[], ' + ')
from information_schema.columns c
join information_schema.tables t using (table_schema, table_name)
where table_schema = 'public' and data_type = 'uuid' and t.table_type = 'BASE TABLE';
```

`tableforest` precisa ser **false** (o `true` devolve varios `<row>` sem raiz e o
`xpath` nao parseia quando ha mais de uma linha).

**A importacao de avaliacoes tinha rodado duas vezes** — 6.370 copias exatas em
3.105 fichas, achadas por aqui e limpas em 05/10/2026. O que era copia, o que
era pesagem de verdade na mesma data e o que era data perdida esta em
[[fitmind-avaliacoes-importadas]].

Migrations do caso: `20261003120000_emmily_ventura_um_cadastro_so.sql` e
`20261003130000_emmily_ventura_as_avaliacoes_dela.sql`. Retratos do antes em
`auditoria.emmily_ventura_20261003` (48 linhas) e
`auditoria.emmily_ventura_avaliacoes_20261003` (8 linhas) — foram para
`auditoria` por engano, antes de ver que a convencao desta frente e o schema
`backup`; os dois ficam fora do PostgREST e sem acesso de `anon`/`authenticated`.
