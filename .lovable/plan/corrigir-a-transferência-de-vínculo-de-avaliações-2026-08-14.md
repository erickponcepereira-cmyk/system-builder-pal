# Corrigir a transferência de vínculo de avaliações

## O que é o erro

`duplicate key value violates unique constraint "coach_evaluation_clients_student_id_unique"` — um mesmo aluno não pode estar vinculado a dois cadastros de avaliação ao mesmo tempo.

## Por que parou de funcionar (confirmado nos dados)

No caso da tela:

- Cadastro novo: "Adevair Pedroza de souza" (coach Ana Flávia), sem aluno vinculado.
- Cadastro antigo: "Adevair Sousa" (coach **Jean Carlos**), já vinculado ao aluno.

A tela faz a transferência em passos separados pelo navegador: move as avaliações, apaga o cadastro duplicado e só então grava o vínculo no cadastro novo.

As regras de acesso permitem que um master coach **veja e edite** cadastros de outros coaches, mas **não permitem excluir** — a exclusão vale só para cadastros do próprio coach. Como a exclusão não gera erro (apenas não apaga nada), o cadastro antigo continua com o aluno e, no passo seguinte, o banco recusa o vínculo duplicado. Por isso funciona quando o duplicado é do mesmo coach e falha quando é de outro coach.

## Correção

1. Fazer a transferência inteira no servidor, em uma única operação (tudo ou nada): mover as avaliações, soltar/excluir os cadastros antigos e gravar o novo vínculo. Se qualquer etapa falhar, nada é aplicado e a mensagem de erro é clara.
2. A operação valida quem pode executá-la: administrador, master coach ou o coach dono do cadastro. Nada muda para quem não tem essa permissão.
3. Manter exatamente o comportamento atual visível: mesmo modal, mesma confirmação por texto, opção "excluir cadastro duplicado" (quando desmarcada, o cadastro antigo apenas perde o vínculo), mesmo registro de auditoria e mesmas mensagens de sucesso.

## Verificação

- Refazer o caso Adevair: transferir o vínculo do cadastro da Ana Flávia sobre o duplicado do Jean Carlos e confirmar que as avaliações migram, o duplicado some e o erro não aparece.
- Repetir uma vinculação simples (aluno sem cadastro anterior) e uma transferência dentro do mesmo coach para garantir que nada regrediu.

## Detalhes técnicos

- Migração criando `public.transfer_evaluation_client_link(_client_id uuid, _student_id uuid, _delete_duplicates boolean)` como `SECURITY DEFINER`, `search_path = public`, com checagem de permissão (`current_user_is_admin()` / `current_user_is_master_coach()` / `current_user_coach_ids()`), grant de execute para `authenticated`, retornando os ids afetados para a auditoria.
- `src/components/coach/tabs/EvaluateTab.tsx`: `executeConfirmedLink` passa a chamar essa RPC no lugar dos updates/deletes diretos; a inserção em `evaluation_link_audit` continua como está, usando o retorno da função.
