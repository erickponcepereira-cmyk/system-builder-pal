## Diagnóstico (verificado no banco e no código)

- O Erick **foi vinculado com sucesso**: existe a linha em `partner_members` (unidade do Gilberto, papel `staff`, permissões `overview.ver, agenda.ver, timeline.editar, scanner.usar, profile.editar, store.ver`). Ou seja, o convite e o salvamento das permissões funcionam.
- O que falta é o **caminho de entrada**: nada no app leva o Erick ao painel da unidade.
  - `RoleSwitcher.tsx` só oferece o painel "Parceiro" quando existe linha em `partners` com `profile_id` do usuário. O Erick é membro, não dono, então a opção nunca aparece (ele fica só como Aluno).
  - Mesmo forçando `/partner`, o `PartnerOnboardingGate` (que checa se o perfil é dono de um cadastro de parceiro) e o `SubscriptionGuard` bloqueariam o membro pedindo pagamento/aprovação de parceiro — regras que valem para o dono, não para a recepção.
- Do lado do dono, a aba **Membros** hoje lista só a unidade ativa e não mostra quem é a pessoa na plataforma (aluno, coach etc.), o que dá a sensação de "não sei quem está na minha equipe".

## Entrega desta correção

### 1. Membro da equipe consegue entrar na unidade
- `RoleSwitcher`: além de `partners`, considerar vínculo em `partner_members` (via a RPC de unidades já existente). Se a pessoa é membro de alguma unidade, a opção **Parceiro** aparece no seletor de painel (que já existe no painel do aluno).
- `partner.tsx`: carregar as unidades **antes** dos gates. Se o usuário não é dono de nenhuma unidade (papel `manager`/`staff`), pular `PartnerOnboardingGate` e `SubscriptionGuard` — mensalidade/anuidade e aprovação são responsabilidade do dono. As abas continuam filtradas pelas permissões dele.
- Se o membro não tiver nenhuma permissão marcada, mostrar tela explicativa ("peça acesso ao dono da unidade") em vez de tela vazia.
- Ao adicionar um membro, criar uma **notificação** no perfil dele ("Você foi adicionado à equipe de {unidade}"), para que algo aconteça visivelmente no perfil do convidado.

### 2. Dono enxerga e controla a equipe
- Aba **Membros** passa a mostrar, por pessoa: nome, e-mail, papel na unidade (Dono/Gerente/Equipe), **perfil na plataforma** (Aluno / Coach / Profissional / Parceiro / Admin) e data de entrada.
- Alternador **"Só esta unidade" / "Todas as minhas unidades"**, com as pessoas agrupadas por unidade — o dono vê a equipe inteira das 3 academias em um lugar.
- Permissões: as caixas continuam por aba, agora com rótulo "Abas liberadas", contador (ex.: 6 de 15), botões **Marcar todas** / **Limpar** e confirmação visual de salvo (hoje salva sem feedback claro).
- Alterar permissão ou papel reflete imediatamente nas abas que o membro vê no próximo carregamento do painel dele.

## Detalhes técnicos

- Sem migração nova: `partner_members`, `partner_pode`, `minhas_unidades_parceiro` e as políticas de RLS já existem e estão corretas (`select` via `current_partner_ids()`, `update`/`delete` via `partner_pode(partner_id,'members.gerenciar')`).
- A leitura de nome/e-mail/role dos membros continua pela tabela `profiles` restrita aos ids já visíveis pela política atual; nenhuma policy nova, nenhum dado exposto a mais.
- A notificação de convite é criada no server function `addPartnerMemberByEmail`, que já roda com privilégio e valida permissão do chamador.
- Arquivos alterados: `src/components/RoleSwitcher.tsx`, `src/routes/_authenticated/partner.tsx`, `src/components/partner/PartnerMembersPanel.tsx`, `src/lib/partner-members.functions.ts` (+ leitura da equipe por unidade).

Depois disso, paro para você testar com o Erick antes de iniciar a Entrega 2.
