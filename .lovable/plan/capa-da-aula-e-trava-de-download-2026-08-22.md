# Capa da aula e trava de download

Aplicar o script enviado, sem tocar em nada além do motor de aulas.

## Situação atual (verificada no banco)
- As 4 aulas em vídeo estão com download liberado (`allow_download = true`) e o padrão da coluna também é `true`.
- A coluna `thumbnail_key` ainda não existe (o painel do criador já tem botão "Capa" no código, então hoje ele não tem onde gravar).
- `require_watermark` existe, mas ainda não está ligada nas aulas do curso Formação de Coach.
- A policy `course_videos_manage` do bucket existe e será substituída pela versão nova.

## O que a migration faz
1. Desliga download em toda aula de vídeo e muda o padrão da coluna para desligado (material de apoio continua podendo ser baixado).
2. Cria `thumbnail_key` para a capa da aula, guardada no mesmo bucket privado do vídeo e entregue por link assinado.
3. Liga a marca d'água nas aulas do curso Formação de Coach.
4. Recria a regra de acesso ao bucket `course-videos`: admin sempre pode; parceiro/profissional podem enviar arquivos do próprio curso quando a pasta é o id do produto (`course-videos/<produto_id>/arquivo`). A regra usa `is_admin` e `can_manage_digital_product`, sem consultar `profiles` direto — assim usuário anônimo recebe negação limpa em vez de erro de permissão.

Os vídeos antigos em `formacao-coach/` continuam só sob admin, como o script prevê.

## Detalhes técnicos
- Migration aplicada exatamente como enviada (as duas versões da policy, na ordem; a segunda substitui a primeira).
- Nada nas policies de `partners` nem na RPC `parceiro_do_dono` é alterado.
- Depois de aplicar, rodo as duas consultas de conferência do script.
- Não altero código nesta etapa; o painel do criador e o player já leem `thumbnailKey`/`allow_download`. Se após a migration os tipos do banco precisarem refletir `thumbnail_key`, isso entra junto na regeneração automática de tipos.
