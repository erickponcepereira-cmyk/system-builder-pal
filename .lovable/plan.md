# Árvore da rede clicável em todos os níveis + fotos da avaliação no celular

## 1. Árvore da rede: abrir o modal de qualquer pessoa

Hoje, na aba "Árvore da rede", só os coaches da primeira linha abrem o modal de perfil. Os níveis abaixo são renderizados como não clicáveis, por decisão anterior.

Mudança: qualquer nó da árvore passa a abrir o modal de perfil, em todos os níveis da rede do usuário. O visual de clique (destaque ao passar/tocar) passa a valer para todos os cartões.

Observação: a árvore já traz apenas a rede do próprio usuário, então liberar o clique não expõe ninguém de fora da rede dele.

## 2. Anexar fotos no "Avaliar aluno": lentidão e fotos que somem

Situação atual: ao escolher a foto, o app carrega o arquivo inteiro (fotos de celular novo passam de 10-50 MP), reduz para 1280px em memória e só então envia. Em aparelho mais fraco isso trava por vários segundos e, se a decodificação falhar, a foto simplesmente não aparece e o coach precisa anexar de novo.

Correções:

- Redução mais agressiva e mais barata: a imagem passa a ser decodificada já em tamanho reduzido (o navegador redimensiona durante a leitura, sem carregar os 50 MP na memória), com lado máximo de 1080px e compressão JPEG mais forte. O arquivo final fica tipicamente entre 100-250 KB.
- Caminho de segurança: se a decodificação rápida falhar no aparelho, cai automaticamente para o método antigo, e se ainda assim falhar, mostra mensagem clara em vez de sumir em silêncio.
- Feedback e proteção: enquanto processa/envia, o campo mostra "Comprimindo... / Enviando..." e fica desabilitado, evitando toques repetidos que reiniciam o processo.
- Falha de rede no envio: nova tentativa automática (2x) antes de avisar o usuário.
- Mesmo tratamento nos dois pontos de anexo: nova avaliação e edição da avaliação.

## 3. Redmi Note 12 Pro: não aparece a opção de câmera

Nesse aparelho (MIUI), o seletor de arquivos abre direto na galeria e não oferece a câmera. Em vez de depender do comportamento do sistema, o campo de foto passa a mostrar duas opções explícitas:

- "Tirar foto" — abre a câmera diretamente.
- "Galeria" — abre o seletor de arquivos.

Isso funciona em todos os aparelhos e resolve o caso do MIUI sem alterar o comportamento nos que já estão bons.

## Detalhes técnicos

- `src/components/coach/tabs/NetworkTreeTab.tsx`: `TreeNode` passa `clickable` para os filhos (hoje fixo em `false`).
- `src/lib/assessment-photos.ts`: `downscaleImage` passa a usar `createImageBitmap(file, { resizeWidth/resizeHeight, resizeQuality: "medium" })` com `MAX_SIDE = 1080` e `QUALITY = 0.75`, mantendo o fallback via `HTMLImageElement`; `uploadAssessmentPhoto` ganha retry (2 tentativas) e estados de progresso ("compressing" | "uploading") via callback opcional.
- `src/components/coach/FitMindShape.tsx` e `src/components/coach/AssessmentComparison.tsx`: dois inputs por foto — um com `capture="environment"` (câmera) e outro sem (galeria) — com rótulos "Tirar foto" e "Galeria", e desabilitação do campo durante o processamento.
- Sem alterações de banco de dados.
