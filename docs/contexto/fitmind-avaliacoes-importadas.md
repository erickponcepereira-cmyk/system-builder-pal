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
