# Modal "Instalar o app" ilegível no iPhone (Safari)

## O que foi confirmado

- O link `https://fitmindclub.com.br/r/EWIKTL` funciona: valida a indicação e leva para a tela de cadastro (testado localmente). O problema não é o link em si.
- A tela da foto é a home com o modal "Instalar o app FitMind" aberto.
- Reproduzindo a mesma tela em navegador simulando iPhone (430x932), o modal aparece **legível**: fundo escuro sólido no cartão, textos brancos. Ou seja, o defeito é específico do Safari do iPhone e não aparece no ambiente de teste.
- No código, o véu do modal usa uma cor traduzida pelo Tailwind para o formato moderno `oklab(0 0 0 / 0.7)`, e o cartão fica **dentro** desse véu, sem camada isolada. Também não há `portal`: o modal é filho da página, então qualquer efeito visual em um elemento acima dele (filtro, opacidade, transparência) escurece o cartão junto — que é exatamente o sintoma da foto (tudo, inclusive o texto do modal, escurecido, com apenas o botão rosa/vermelho normal).

Diagnóstico provável (ainda não confirmado no aparelho): o cartão está sendo pintado **sob** a camada escura no Safari. A correção abaixo elimina essa possibilidade de raiz em vez de tentar adivinhar o efeito exato.

## O que será feito

1. **Tirar o modal de dentro da página**: renderizar o modal de instalação em uma camada própria, presa ao corpo do documento (portal), para que nenhum efeito visual da página o afete.
2. **Cores à prova de Safari**: usar cor sólida explícita (`rgba(0,0,0,0.7)` para o véu e `#161616` para o cartão) e cor de texto explícita (`#FFFFFF` / branco a 80%) no lugar de valores que dependem de formatos de cor mais novos.
3. **Isolar a pilha de camadas**: cartão com camada própria acima do véu, garantindo que o título, os passos e o botão fiquem sempre no mesmo nível de brilho.
4. **Área segura do iPhone**: manter o modal dentro da área visível (notch e barra inferior), com o botão "Entendi" e o "X" sempre clicáveis, inclusive no iPhone 17 Pro Max.
5. **Mesma correção nos outros pontos** onde esse botão aparece (home, login, cadastro) — é o mesmo componente, então a correção vale para todos.

Sem mudança de lógica de cadastro, indicação, pagamento ou comissão: apenas apresentação do modal.

## Verificação

- Conferir no Safari do iPhone: abrir pelo link da Carol, ir até a home, tocar em "Instalar FitMind no iPhone" e confirmar que o texto aparece branco e legível, o "X" fecha e o "Entendi" fecha.
- Conferir também em 390x844 e 430x932 e no Chrome Android, para garantir que nada regrediu.

## Detalhes técnicos

- `src/components/InstallAppButton.tsx`: mover o bloco `showIosHelp` para `createPortal(..., document.body)` (com guarda de `mounted`), trocar `bg-black/70` por `style={{ backgroundColor: "rgba(0,0,0,0.7)" }}`, o cartão para `style={{ backgroundColor: "#161616", color: "#fff", isolation: "isolate", position: "relative", zIndex: 1 }}`, e substituir `text-white/80` por cor explícita `rgba(255,255,255,0.82)`.
- Manter a classe `modal-safe` (teto de altura via `--vvh` + safe-areas) e adicionar `paddingBottom: env(safe-area-inset-bottom)` no rodapé do cartão.
- Nenhuma alteração em `src/styles.css` global, para não afetar os demais modais já ajustados.
