## O que aconteceu

Encontrei a causa. Não foi um bug de tela nem transferência manual — foi uma migração aplicada em **26/06/2026** que consolidou duas contas do Erick e, no processo, subiu a rede errada.

### Linha do tempo

1. Existiam **duas contas do Erick** no banco:
  - `erickpppjur@hotmail.com` (antiga, coach id `d2412b0a…`) — direto da Ana Flávia
  - `erickponcepereira@outlook.com` (atual, coach id `f9a44c8a…`) — também direto da Ana Flávia
2. A conta antiga tinha vários coaches abaixo dela: **Marina Alves, Elaine Avanci, Ricardo Nogueira, Dayana Leite, Narah Reis, Dheverson Cunha** (e depois Delma, Vitória entraram já no atual).
3. Em 26/06 rodou a migração `20260626013238_dd5cc3e5…sql`, que:
  - Deletou o `auth.users` da conta antiga do Erick.
  - Rodou `UPDATE coaches SET upline_coach_id = f9a44c8a WHERE upline_coach_id = d2412b0a` — ou seja, empurrou todos os "netos" da Ana Flávia (que estavam sob o Erick antigo) para **diretos do Erick atual**.
  - Gerou a notificação "Rede transferida para você" para o Erick atual.
4. Em 29/06 a migração `20260629225633` criou linhas `students` faltantes para todos os coaches aprovados usando o `upline_coach_id` atual — por isso Marina, Elaine, Ricardo, Dayana aparecem também como "alunos diretos" do Erick, todas com `created_at` idêntico (22:56:28).

### Estado atual no banco

- Ana Flávia (`f25c12d0…`) — 6 diretos: Erick atual, Carla Monique, Jean, Marilene, Irineia, Tiago. Rede total (recursiva) = 20.
- Erick atual (`f9a44c8a…`) — 9 diretos: Master (conta interna), Narah, Dheverson, Marina, Elaine, Ricardo, Dayana, Delma, Vitória. Rede total = 13.

Ou seja: a rede não "sumiu" da Ana Flávia — ela continua contando no total dela porque o Erick é direto dela. Mas os coaches que eram **netos** dela viraram **diretos do Erick** em vez de subirem para a Ana como diretos.

## O que fazer (preciso da sua decisão)

Três opções, escolha uma:

**A. Deixar como está.** A rede segue no total da Ana, só que aninhada sob o Erick. Nada muda.

**B. Promover para a Ana Flávia como diretos dela.** Reatribuir Marina, Elaine, Ricardo, Dayana (e opcionalmente Narah, Dheverson) para `upline_coach_id = Ana Flávia`, saindo do Erick. Também reverto os `students.coach_id` desses perfis para a Ana. Comissões futuras vão para a Ana; comissões passadas ficam como estão.

**C. Manter a estrutura atual mas ajustar comissões/créditos** (se a queixa for financeira, não hierárquica). Nesse caso me diga qual período recalcular.

Também recomendo, independentemente da opção:

- Corrigir a função `get_system_fallback_coach_id()` que hoje tem o id do Erick atual **hard-coded** como fallback global — qualquer novo `ensure_student_for_profile` sem upline cai automaticamente na conta dele. Trocar por uma configuração explícita (ex.: `app_settings.fallback_coach_id`) ou pelo admin master.

Me confirme a opção (A, B ou C) e se quer que eu já corrija o fallback hard-coded.

pode seguir com A, acredito que o fluxo entao ficou correto e sobre corrigir o fallback, quando um coach abaixo sai, o de cima assume a rede, por exemplo, se eu erickponce sair, a ana flavia assume minha rede.