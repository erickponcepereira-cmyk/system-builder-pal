# Corrigir a lentidão geral do app e do site

## O que eu encontrei (medido no banco agora)

As telas estão lentas porque o banco está gastando segundos em consultas simples. Números reais do período recente:

| Consulta | Chamadas | Tempo médio | Tempo total |
|---|---|---|---|
| Lista de produtos profissionais (loja) | 1.196 | 1,84 s | 36 min |
| Avaliações corporais (`coach_body_assessments`) | 499 | 1,89 s | 15 min |
| Base de clientes de avaliação | 152 + 143 + 77 | ~1,2–1,6 s | ~8 min |
| Registro de "último login" (escrita) | 44.524 | 13 ms (picos de 3 s) | 10 min |
| Registro de "última atividade do coach" | 44.373 | 2 ms | 1,5 min |

As tabelas são pequenas (1.578 produtos profissionais, 141 perfis, 22 mil avaliações) e os índices necessários já existem. Ou seja: não é volume de dados nem falta de índice — é o custo das regras de segurança (RLS) sendo recalculado linha a linha, somado a telas que baixam a tabela inteira.

### Causa 1 — Regras de segurança avaliadas linha a linha

Nas políticas dessas tabelas as funções de permissão são chamadas **uma vez por linha** em vez de uma vez por consulta:

- `professional_products`: 3 políticas de leitura, duas delas com subconsultas que cruzam `coaches` + `profiles` usando `auth.uid()` direto. Com 1.578 linhas isso vira milhares de subconsultas por requisição.
- `coach_body_assessments` (22 mil linhas): cada linha executa `current_user_is_admin()`, `current_user_is_master_coach()`, `current_user_coach_ids()` e `current_user_student_ids()`.
- `coach_evaluation_clients` (6,6 mil linhas): mesmo padrão.
- `partner_products`: `is_admin(auth.uid())` e `current_partner_id()` por linha.

Todas essas funções já são `STABLE`, mas o Postgres só as executa uma única vez quando são escritas como `(select funcao())`. Hoje não estão.

### Causa 2 — Telas que baixam tudo

A consulta de avaliações aparece **sem filtro de coach**, ordenando 22 mil linhas (50 MB de tabela) e deixando o filtro para a RLS. O mesmo acontece na base de clientes. Isso multiplica o custo da causa 1.

### Causa 3 — Escritas de "batimento" excessivas

`touchLastLogin` (chamado em `src/routes/__root.tsx`) grava em `profiles` e `coaches` a cada sessão detectada e a cada `TOKEN_REFRESHED`. Resultado: ~44 mil UPDATEs, com picos de 3 segundos, competindo com as leituras e gerando lixo (dead tuples) em tabelas quentes.

## O que vou fazer

### 1. Reescrever as políticas de RLS das tabelas quentes (maior ganho)
Migração que recria as políticas de `professional_products`, `partner_products`, `coach_body_assessments` e `coach_evaluation_clients` envolvendo as chamadas de permissão em `(select ...)`, sem mudar **nada** de quem pode ver o quê. Também unifico as políticas de leitura sobrepostas de `professional_products` em uma única política (hoje o Postgres avalia todas para cada linha). Expectativa: de ~1,8 s para poucos milissegundos.

### 2. Filtrar as consultas na origem
Nas telas de avaliação/base de clientes, enviar o filtro de coach (e um limite de linhas) explicitamente na consulta, em vez de trazer a tabela inteira e deixar a RLS podar.

### 3. Reduzir o batimento de login
Registrar o "último acesso" no máximo uma vez a cada 12 horas por usuário (marcação local + verificação no servidor) e ignorar o evento de renovação de token. Isso corta ~95% dessas escritas.

### 4. Limpeza e verificação
`VACUUM ANALYZE` nas tabelas afetadas e, ao final, nova leitura das consultas mais lentas para confirmar a queda dos tempos.

## Observação
Se depois disso ainda houver lentidão em horário de pico, o próximo passo é avaliar o tamanho da instância do backend — mas os números atuais apontam para as políticas de segurança, não para falta de máquina.
