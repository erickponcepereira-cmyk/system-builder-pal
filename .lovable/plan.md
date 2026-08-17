# Corrigir "Could not query the database for the schema cache" ao salvar avaliação

## O que está acontecendo

O erro não é do app em si: o banco fica sobrecarregado no momento de salvar a avaliação e a camada de API perde a conexão, exibindo essa mensagem vermelha.

A causa foi confirmada nos dados:

- As fotos da avaliação (frente, costas, laterais) **não vão para o armazenamento de arquivos** — elas são convertidas em texto e gravadas dentro da própria linha da avaliação, na coluna `photos`.
- Hoje existem 22 avaliações com fotos gravadas assim, e **uma delas tem 11,6 MB só de texto de foto**.
- A tabela `coach_body_assessments` já ocupa 129 MB de um banco de 182 MB.
- Nos registros de desempenho, o salvamento dessa avaliação (`UPDATE coach_body_assessments`) leva **5,5 segundos** e a leitura por aluno leva **3,3 segundos**; houve um erro de *statement timeout* poucos minutos antes do print.

"Parou de funcionar" porque celulares novos geram fotos cada vez maiores: enquanto as fotos eram pequenas, o salvamento passava; agora ele estoura o tempo limite e derruba a conexão da API.

## Correção proposta

### 1. Fotos da avaliação passam a usar o armazenamento de arquivos
Nos dois pontos onde a foto vira texto hoje (`FitMindShape.tsx` — passo Fotos da nova avaliação — e `AssessmentComparison.tsx` — edição da avaliação):

- Passar a foto pelo recorte 1:1 já existente (`ImageCropProvider`), com redução para no máximo ~1280px e compressão JPEG.
- Enviar para o bucket privado `evolution-photos`, no caminho `{coach_id}/assessments/{assessment_id|tmp}/{view}.jpg`.
- Gravar apenas o **caminho** do arquivo em `photos`, não o conteúdo.

### 2. Exibição compatível com o que já existe
Criar um helper de leitura que:
- se o valor começar com `data:image` (registro antigo), mostra direto;
- caso contrário, gera URL assinada do bucket (mesmo padrão de `signPhoto` já usado em Evolução).

Aplicar esse helper em todos os pontos que mostram fotos de avaliação (nova avaliação, edição, comparação, detalhes do aluno, resultado compartilhado, PDF).

### 3. Limpar o que já está no banco
Script único de migração dos 22 registros existentes: enviar cada foto em base64 para o bucket e substituir pelo caminho. Depois disso a tabela volta a um tamanho saudável e as leituras deixam de arrastar megabytes.

### 4. Proteções para não repetir
- Bloqueio no salvamento se o campo `photos` exceder um limite pequeno (ex.: 200 KB de texto), com mensagem clara em vez de travar.
- Mensagem de erro amigável quando o salvamento demora demais, em vez do erro cru da API.

## Fora do escopo (mas encontrado no diagnóstico)

Dois erros distintos aparecem nos registros do banco e podem ser tratados depois, se você quiser:
- `invalid input value for enum commission_status: "paid"` — alguma rotina grava um status que não existe no tipo.
- chave duplicada em `coach_patent_achievements` ao conceder patente já existente.

## Detalhes técnicos

- Arquivos principais: `src/components/coach/FitMindShape.tsx`, `src/components/coach/AssessmentComparison.tsx`, `src/components/coach/StudentDetailsModal.tsx`, `src/components/coach/FitMindShapeResultView.tsx`, novo `src/lib/assessment-photos.ts`.
- Bucket: `evolution-photos` (privado, já existente); políticas de `storage.objects` revisadas para permitir upload/leitura do coach dono e do aluno correspondente.
- A migração dos 22 registros roda via função server-side com service role, não pelo navegador.
