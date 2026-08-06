# Corrigir indicador e retorno à loja após cadastro

## Diagnóstico confirmado

- Ao nascer um perfil de aluno, o trigger `trg_profile_ensure_student` cria imediatamente uma linha em `students` com um coach provisório e `coach_assignment_pending = true`.
- No cadastro Google, `completeGoogleStudentSignup` chama `ensureStudentForProfile`; quando a linha provisória já existe, a função retorna sem trocar o coach pelo indicador validado. Isso explica o coach padrão/incorreto permanecer mesmo com um link válido.
- O callback do Google preserva o destino no caminho normal, mas no tratamento de erro redireciona para `/complete-signup` sem restaurar a intenção de loja/produto.
- A página de conclusão confia em estado fragmentado do navegador para exibir o coach. A gravação final já revalida o código no backend, mas o caminho de perfil preexistente não atualiza a linha de aluno encontrada.
- O banco atualmente tem alunos com `coach_assignment_pending = true`, confirmando que existem vínculos provisórios aguardando substituição. Existe também um caso de aluno vinculado ao próprio registro de coach, portanto a proteção contra autoindicação precisa ser aplicada na conclusão.

## O que será corrigido

1. **Tornar a indicação autoritativa na conclusão**
   - Revalidar o código de indicação no backend no momento de concluir o cadastro.
   - Se já existir uma linha provisória em `students`, atualizar `coach_id`, `referred_by_student_id`, `partner_id` e marcar `coach_assignment_pending = false`, em vez de simplesmente mantê-la.
   - Impedir que o perfil seja vinculado ao próprio registro de coach; quando isso ocorrer, rejeitar a escolha e exigir um indicador válido, sem gravar um vínculo incorreto.

2. **Unificar Google e cadastro por e-mail**
   - Extrair uma única rotina de finalização do vínculo do aluno, usada tanto pelo cadastro normal quanto pela página complementar do Google.
   - Manter `/complete-signup` somente quando faltarem dados reais da conta Google; cadastro por e-mail já preenchido não deverá refazer essas informações.
   - Não mandar silenciosamente para a página complementar quando a verificação da conta falhar: mostrar erro recuperável ou retornar ao login preservando o contexto.

3. **Preservar loja, produto e carrinho até o fim**
   - Manter a intenção de checkout/produto até a criação e vinculação do aluno terminarem com sucesso.
   - No callback e em todos os tratamentos de erro, restaurar a intenção antes de qualquer redirecionamento.
   - Consumir a intenção apenas no redirecionamento final para `/student/store`, mantendo `produto` ou `checkout=1` e selecionando a área de aluno.

4. **Estabilizar a página “Completar cadastro”**
   - Resolver novamente o indicador pelo código salvo antes de montar o formulário.
   - Exibir o coach validado como bloqueado quando veio de indicação; permitir seleção apenas quando não existe indicação válida.
   - Não limpar indicação nem intenção de loja até o backend confirmar que o aluno e o coach correto foram salvos.

5. **Corrigir dados provisórios afetados com segurança**
   - Criar migração para tornar a função de garantia de aluno capaz de substituir somente vínculos provisórios por um coach confirmado.
   - Preservar vínculos já confirmados; não fazer troca em massa baseada em suposição.
   - Identificar e corrigir apenas auto-vínculos e pendências que tenham evidência de indicação recuperável.

## Validação

- Testar link de loja com indicador → carrinho → cadastro por e-mail → confirmação/login → loja logada com checkout e coach corretos.
- Testar link de produto com indicador → Google → completar dados → mesmo produto aberto e coach correto.
- Testar Google de conta já completa → não abrir `/complete-signup`.
- Testar cadastro sem link → seleção manual de coach, impedindo escolher a si próprio.
- Confirmar no banco que `students.coach_id` corresponde ao código validado e `coach_assignment_pending = false` após concluir.
- Testar falha temporária no callback para garantir que loja, produto, carrinho e indicador continuem preservados.

## Detalhes técnicos

- Ajustes concentrados em `google-signup.functions.ts`, `registration.server.ts`, `auth.callback.tsx`, `complete-signup.tsx` e nos utilitários de intenção/indicação.
- Migração idempotente para a rotina de vínculo provisório, mantendo RLS e permissões atuais.
- Testes de regressão para os dois métodos de cadastro e para bloqueio de autoindicação.