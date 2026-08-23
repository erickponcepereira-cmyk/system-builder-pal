# Benefícios/Gratuitos: erro visível + bloqueio no uso

Dois arquivos, mesmo padrão nos dois:
`src/components/coach/tabs/BenefitsTab.tsx` e `src/routes/_authenticated/student.freebies.tsx`.

## Tarefa 1 — parar de engolir o erro e achar a causa

Hoje a consulta de `partner_products` é lida como `const { data } = ...` nos dois arquivos (BenefitsTab linha ~114; student.freebies dentro do `Promise.all`, item `c`). Qualquer falha vira `data = null` e a tela mostra "Nenhum benefício gratuito disponível no momento".

Mudanças:
- Capturar `error` das consultas de `partner_products` (e da de `professional_products` na tela do aluno, mesmo padrão).
- Em caso de erro: `console.error` com o objeto completo e guardar a mensagem em estado (`loadError`).
- Quando houver `loadError`, o bloco da lista mostra um aviso "Não foi possível carregar os benefícios" com o texto do erro e um botão "Tentar de novo" — visualmente diferente da mensagem de lista vazia, que continua só para o caso de zero resultados.

Depois disso, abrir a tela, ler o erro real no console e corrigir a causa.

Hipótese principal (ainda não confirmada, a ser validada pelo erro real): o embed `partners(...)` do select. As telas de parceiro passaram a usar RPCs (`parceiro_publico`) depois do endurecimento de permissões, e o select pede colunas sensíveis (`address`, `whatsapp`, `public_whatsapp`, além de `city/state/status`). Se a leitura direta dessas colunas estiver bloqueada, o PostgREST devolve erro para a consulta inteira — e não uma lista vazia, o que casa exatamente com o sintoma.

Se o erro confirmar isso, o conserto é feito nesta mesma consulta: reduzir o embed às colunas realmente permitidas e, se necessário, buscar os dados de parceiro por um caminho já autorizado, mantendo os campos que os cartões e o modal de reserva usam (nome fantasia, foto, cidade/UF, endereço e WhatsApp para agendamento). Nenhuma outra consulta é tocada.

## Tarefa 2 — carteirinha inativa não esconde mais a lista

Nos dois arquivos existe hoje um ramo `) : !cardActive ? (` que substitui todo o conteúdo por um aviso.

- Remover esse ramo: a lista, os cartões e os valores aparecem sempre.
- Com carteirinha inativa, exibir no topo uma tarja discreta (uma linha, tom âmbar, no padrão atual) informando que a carteirinha está inativa.
- Cartões com carteirinha inativa ficam levemente esmaecidos (opacidade suave), mantendo nome, descrição e valor estimado legíveis.
- Bloqueio passa a ser no uso: nos botões "Resgatar", "Gerar cupom" e "Reservar" (cartão e modal de detalhe), se `cardActive` for falso, não chamar nenhuma RPC — abrir um modal avisando que a carteirinha está inativa e que basta comprar um produto na loja para ativar, com botão que leva para `/student/store`.

## Fora do escopo

Nenhuma alteração em funções do banco, tabelas, políticas ou outras telas. Nenhuma outra consulta além das citadas na Tarefa 1. Padrão gráfico atual mantido.
