# Correções: vínculo do coach, gênero e lista de "Avaliar aluno"

## O que eu verifiquei no banco

- **Julieta**: o aluno está corretamente vinculado à **Ana Flávia** na tabela de alunos. Porém a *ficha de avaliação* dela foi criada em outro momento, apontando para o **Erick** e com gênero "other" — a ficha é uma "foto" do momento da criação e nunca é atualizada quando o aluno troca de coach ou completa o cadastro.
- **Maria Eduarda Silva**: a ficha existe sob a Ana Flávia **e a avaliação foi salva** (registrada em 05/08 às 20:06). Ou seja, o dado não se perdeu — ele só não está aparecendo na lista.
- **Ana Flávia**: ela é Master Coach, então a lista "Avaliar aluno" carrega as fichas de **toda a rede** (6.630 fichas), não só as 1.282 dela. Ela vê ~1.100 porque a paginação da lista está quebrada: a consulta ordena por data de criação, e milhares de fichas importadas têm exatamente a mesma data — sem critério de desempate, cada página traz registros repetidos e deixa outros de fora. A limpeza de duplicados no app depois reduz tudo para o número travado que ela vê. É exatamente por isso que a Maria Eduarda "sumiu".

## O que vou corrigir

**1. Ficha de avaliação sempre em sincronia com o aluno**
- Quando o aluno trocar de coach, a ficha de avaliação passa a acompanhar o novo coach (avaliações antigas continuam preservadas).
- Quando o perfil for atualizado (gênero, nome, foto, nascimento, altura), a ficha é atualizada junto — corrige o avatar masculino para a Julieta.
- Correção retroativa: reaponto as fichas cujo coach diverge do coach atual do aluno e re-sincronizo gênero/nome/foto de todas as fichas ligadas a alunos.

**2. Lista "Avaliar aluno" completa e estável**
- Ordenação com critério de desempate (data + id), para a paginação nunca repetir nem pular registros. Com isso a lista deixa de travar em ~1.100 e a Maria Eduarda volta a aparecer com a avaliação lançada.
- A lista passa a abrir por padrão no filtro **"Meus alunos"** para o Master Coach (hoje abre com a rede inteira, o que gera a confusão de milhares de nomes); o filtro "Rede completa" continua disponível.
- Ao gravar uma avaliação, a lista é recarregada do servidor (invalidando o cache de 5 minutos) para o registro aparecer na hora.

**3. Gênero na ficha nova**
- A criação automática de ficha passa a ler o gênero do perfil no momento correto (e não mais cair em "other" quando o dado chega junto na mesma gravação), inclusive quando o aluno preenche pelo modal de "Complete seu cadastro".

## Detalhes técnicos

- Migração: `ORDER BY vc.created_at DESC, vc.id DESC` em `coach_evaluation_client_summaries`; gatilhos `AFTER UPDATE` em `students` (coach_id) e `profiles` (gender/name/avatar/birthdate) chamando uma nova `sync_coach_evaluation_client_for_student`; backfill de fichas divergentes.
- `src/lib/pending-coach.functions.ts`: gravar o `coach_id` do aluno **antes** do patch de perfil, e chamar a sincronização ao final.
- `src/components/coach/tabs/EvaluateTab.tsx`: invalidar `clientSummaryCache` após salvar avaliação.
- `src/components/coach/FitMindShape.tsx`: `scopeFilter` inicial `"mine"`.
