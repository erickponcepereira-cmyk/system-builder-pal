# Criação de curso por parceiro e profissional

Aplicar a migração enviada, exatamente como escrita, sem alterar nenhum arquivo de frontend.

## Situação atual (verificada no banco)

- `digital_products` tem só duas regras de acesso: administrador faz tudo; qualquer logado lê apenas cursos com status `active`. Parceiro/profissional não cria, não edita e nem vê o próprio rascunho.
- As funções `criar_curso`, `atualizar_curso`, `enviar_curso_para_aprovacao` e `voltar_curso_para_rascunho` **não existem** no banco.
- `can_manage_digital_product` já existe (aceita coach, profissional e parceiro).
- `partner_created_courses` já tem a regra de dono (`pcc_owner`); `coach_created_courses` **não tem** — só admin e uma leitura pública. Confirma a assimetria descrita: o profissional criaria o curso e ele sumiria da tela dele.

## O que a migração faz

1. Criador passa a enxergar o próprio curso mesmo fora do ar (leitura liberada só para logados, via `can_manage_digital_product`).
2. Regra de dono em `coach_created_courses`, espelhando a que o parceiro já tem.
3. `criar_curso`: cria o produto digital como rascunho e grava o vínculo de autoria na mesma transação; parceiro tem prioridade sobre coach quando a pessoa é os dois.
4. `atualizar_curso`: altera só título, descrição, preço e capa. Status e tipo ficam fora de propósito.
5. `enviar_curso_para_aprovacao` / `voltar_curso_para_rascunho`: o criador circula entre rascunho e "em análise"; só o admin coloca no ar. Envio exige pelo menos uma aula.

Todas as funções são `security definer`, com `search_path` fixo, execução negada para visitantes anônimos e liberada para logados.

## Fora do escopo

Nenhuma tela é alterada nesta etapa. Ligar os botões de criar/editar/enviar no painel de cursos é um passo seguinte, depois que a migração estiver aplicada.

## Conferência depois de aplicar

- As quatro funções existem.
- A policy nova de `digital_products` aparece com `{authenticated}`, nunca `{public}`.
