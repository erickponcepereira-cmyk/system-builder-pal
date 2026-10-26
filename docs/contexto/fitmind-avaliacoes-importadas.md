---
name: fitmind-avaliacoes-importadas
description: "As avaliações físicas que vieram de importação: a cópia exata que rodou duas vezes, as datas que o importador carimbou errado, e o link público que fica órfão quando o coach apaga"
metadata:
  node_type: memory
  type: project
---

Levantado em 03/10/2026 ao unificar o cadastro da Emmily Ventura
([[fitmind-unificacao-de-cadastros]]) e limpo em 05/10/2026.

**`coach_body_assessments` não tem ninguém apontando para ela por chave
estrangeira.** No código, só `assessment_shares.assessment_id` (o token de
`/resultado/<token>`, que também vira `initial_share_url` e `final_share_url`
em `competition_enrollments`) e `coach_assessment_deletions.assessment_id`
guardam o id de uma avaliação. É isso que precisa ser olhado antes de remover
qualquer linha de lá.

## Três coisas diferentes pareciam "avaliação duplicada"

Agrupar por `(client_id, assessment_date)` acusava 7.755 grupos e 9.669 linhas
sobrando. Olhando o conteúdo, são três histórias:

- **Cópia exata — 6.370 linhas em 3.105 fichas.** Linha idêntica campo a campo
  a outra, ignorando `id`, `created_at` e `updated_at`. Dois episódios: a
  Ana Flávia reimportou em **28/05/2026** o que já tinha entrado em 18/05
  (1.753 linhas), e a importação do Nathan em **06/07/2026** gravou tudo em
  dobro no mesmo dia (4.614 linhas). **Removidas em 05/10/2026.**
- **Mesma data, medida diferente — 782 grupos.** Diferem em peso, gordura,
  IMC, idade, metabolismo basal. São duas pesagens de verdade registradas com
  a mesma data. **Não são duplicata — não apague.**
- **As 9.336 avaliações do Lucinei criadas em 28/05/2026.** A importação dele
  carimbou **a data da importação** em todas: 9.349 avaliações dele em 2.470
  fichas, e só 305 datas distintas no total. Uma ficha chega a 36 linhas "no
  mesmo dia", todas com medidas diferentes. É **data perdida, não cópia**, e
  só volta com o arquivo de origem. Continua assim.

## A regra que foi usada para apagar

Dentro de cada conjunto de linhas idênticas, fica uma. A ordem de preferência
é **quem tem link público primeiro**, depois a mais antiga:

```sql
row_number() over (
  partition by md5((to_jsonb(t.*) - 'id' - 'created_at' - 'updated_at')::text)
  order by (exists (select 1 from assessment_shares s where s.assessment_id = t.id)) desc,
           t.created_at, t.id)
```

E nenhuma linha com link é apagada, mesmo sendo cópia. Na prática: dos 216
links públicos, 2 estavam na linha que sairia pela ordem antiga, e **nenhum
grupo tinha link dos dois lados** — então as duas viraram as mantidas e as
gêmeas sem link saíram. Nenhum `/resultado/` quebrou, nenhuma ficha ficou sem
avaliação, e sobrou **zero** cópia exata.

Não foi gravado nada em `coach_assessment_deletions`: aquela tela
(`/admin/assessment-deletions`) é o histórico do que **os coaches** apagaram
com motivo declarado, mostra 500 linhas e tinha 26 — 6.370 remoções de sistema
a cegariam. O registro é a migration
`20261005120000_avaliacao_importada_duas_vezes.sql` e o backup
`backup.avaliacoes_duplicadas_20261005`, com a linha inteira em `to_jsonb`.

## Defeito pequeno que ficou de fora

**Quando o coach apaga uma avaliação, o link público dela não é apagado
junto.** Há 8 linhas em `assessment_shares` apontando para avaliação que não
existe mais, e as 8 estão em `coach_assessment_deletions` — é o fluxo de
exclusão do coach que não limpa. Nenhuma delas veio da limpeza de 05/10
(conferido contra o backup). Quem abrir esses 8 endereços de resultado não
acha nada.

## Pesagem final que era cópia da inicial (26/10/2026)

**Sintoma:** desafio de setembro (`competitions.ad334f03`, mês 9) sem ganhador
possível — sete inscritos com pesagem final igual à inicial, resultado zero, e o
Rodrigo "perdendo" 300 kg.

**Como acontece:** o vínculo de uma avaliação com o desafio é refeito **toda vez
que o coach salva a edição dela** (`EvaluateTab` → `linkFitmindAssessmentToChallenge`).
O formulário mostra o vínculo atual e oferece a próxima pesagem da inscrição como
botão — para quem já tem a inicial, "Pesagem Final". O coach abria a avaliação
**inicial** para corrigir um número, tocava em "Pesagem Final", e a mesma avaliação
virava a final: `sync_challenge_assessment` copiava os números dela para `final_*`,
e a marcação de inicial se perdia. O Rodrigo tinha 426,3 digitado na inicial; a
correção para 126,3 foi junto com a troca para final.

**A trava agora:** `recusaDaPesagem` (exportada de `fitmind-challenge.functions.ts`,
com teste) recusa vincular como final a própria avaliação inicial da inscrição, e
recusa final de dia igual ou anterior ao da inicial (e o espelho para a inicial).

**Como se lê quem é quem** quando sobra uma avaliação só: pela data contra a
turma (`competition_groups`). Dentro de `initial_start_date..initial_end_date` é a
inicial; no `final_weigh_in_date` é a final. `final_date` da inscrição é coluna
gerada — não aceita escrita.

**Corrigido em 26/10/2026** (backup em `backup.desafio_pesagem_duplicada_20261026`):

- Elaine Souza e Silva, Ana Caroline Cabral Santana, Emily Magalhães, Lais Daiane
  Silva de Arruda e Clovis Camargo Junior (setembro), e Celly Alves Silva
  (outubro): a única avaliação era da semana da inicial. Voltou a ser a inicial,
  e a final saiu (`weighed_initial`). Nenhum deles tem pesagem final registrada.
- Rodrigo De Moura Barros: 18/09 voltou a inicial (126,3 — o 426,3 sumiu) e a
  avaliação de 14/10, dia da final da turma 3, que nunca tinha sido vinculada,
  virou a final.
- Maritza Fonseca: a avaliação de 14/10, também no dia da final, virou a final.

Com isso setembro tem duas pesagens finais válidas: **Maritza** (69,0 → 67,4 kg,
gordura 37,5 → 36,9%) e **Rodrigo** (126,3 → 124,3 kg, gordura 39,4 → 39,2%).

**Ficou de fora, de propósito:** o desafio de agosto (`8d2d9997`), já encerrado e
premiado em 28/09, ainda tem duas inscrições com a final copiada da inicial —
Lorrayne Aparecida (avaliação de 15/08, semana da inicial) e Velaine Jesus
(avaliação de 22/09, dia da final; a inicial dela se perdeu). As duas tinham
resultado zero e não entravam na disputa, então não mudam o vencedor.
