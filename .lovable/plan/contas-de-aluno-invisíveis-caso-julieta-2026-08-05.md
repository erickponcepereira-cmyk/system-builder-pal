# Contas de aluno "invisíveis" (caso Julieta)

## O que aconteceu

Verifiquei no banco: a Julieta ([julieta_vaz@hotmail.com](mailto:julieta_vaz@hotmail.com)) tem perfil criado em 05/08 com papel "aluno", mas **não existe o registro dela na tabela de alunos**. Por isso ela consegue usar o app, mas não aparece para o coach, nem no admin, nem em nenhuma lista.

Ela não é caso isolado — hoje existem **4 contas** na mesma situação:

- Julieta Xavier Borges neta Neres Vaz (05/08)
- Jaqueline Leite Gonçalves (30/07)
- Fabiana Katrine Setubal da Silva (28/07)
- Rogerio Custodio Peres da Silva (28/07)

No perfil da Julieta os campos telefone, sexo e nascimento estão vazios, o que indica que a conta de acesso e o perfil foram criados, mas a etapa seguinte do cadastro (que grava esses dados e cria o registro de aluno com o coach) não chegou a concluir. A rotina que deveria desfazer o cadastro incompleto também não removeu o perfil, deixando a conta "meio criada" e invisível.

## Correção proposta

1. **Rede de segurança no banco**: sempre que um novo perfil de aluno for criado, o registro de aluno passa a ser criado automaticamente no mesmo instante. Se o cadastro continuar normalmente, o coach correto é gravado por cima. Assim nunca mais nasce uma conta invisível, mesmo se a etapa final falhar.
2. **Recuperar as 4 contas atuais**: criar o registro de aluno que falta para cada uma, com código de indicação próprio. Como não há como saber com certeza quem indicou cada uma, elas ficam vinculadas provisoriamente ao coach padrão do sistema.
3. **Ajuste do coach**: depois de aplicado, você reatribui o coach correto de cada uma pelo painel de admin (troca de coach do aluno) — me diga os nomes dos coaches e eu já deixo tudo apontado certo.

## Detalhes técnicos

- Nova função `ensure_student_row_for_profile(profile_id, coach_id)` (SECURITY DEFINER) que cria a linha em `students` com `referral_code`/`referral_link` únicos, usando o coach informado ou o coach padrão do sistema como fallback.
- Novo gatilho `on_profile_created_ensure_student` em `profiles` (AFTER INSERT), acionado apenas quando `role = 'student'`. O `upsert` já existente em `finalizeRegistration` (onConflict `profile_id`) sobrescreve o coach correto quando o cadastro conclui.
- Bloco de backfill na mesma migração para os perfis com `role = 'student'` sem linha em `students` e sem linha em `coaches`.

Como não tem como saber de quem são coachs, deixe um alerta no admin e envie para cada uma dessas clientes preencherem na próxima entrada no app quem é o coach que trouxe elas e fazer elas preencherem o restante das informações faltantes