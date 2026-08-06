# Modais cortados no Galaxy S20 (e telas estreitas em geral)

No S20 (largura ~360px, tela alta e Chrome Android com barra de endereço que aparece/some) os modais da loja ficam maiores que a área visível: o cabeçalho com o "X" some para cima e os botões de ação ficam abaixo do fim da tela.

## Causas confirmadas no código

1. Os cartões dos modais usam `max-h-[90vh]` (StorePage: carrinho, pagamento, detalhe do produto; PartnerProfessionalStore; PurchaseSuccessModal). No Chrome Android, `vh` usa a altura da tela **com a barra de endereço escondida**, então 90vh é maior que a área realmente visível — o rodapé fica fora.
2. Há duas rolagens aninhadas: o overlay rola (`overflow-y-auto` + `items-start`) e o cartão também rola. Em tela baixa o cartão é empurrado e o "X" sai da área visível.
3. O botão de fechar e a barra de ações não são fixos: eles rolam junto com o conteúdo dentro do cartão.
4. Alguns modais (perfil do aluno, gavetas de admin) nem usam a margem de segurança padrão.

## O que será feito

1. Padronizar a altura útil real: uma variável de altura da janela visível (atualizada quando a barra do navegador aparece/some no Android) usada como teto dos modais, substituindo `90vh`.
2. Ajustar a regra global de modal para: overlay **não** rola; o cartão ocupa no máximo a altura visível e rola apenas por dentro.
3. Tornar cabeçalho (com o botão X) e rodapé de ações fixos dentro do cartão, para que "Fechar", "Finalizar" e "Confirmar" fiquem sempre clicáveis.
4. Aplicar isso aos modais da loja primeiro (carrinho, pagamento, detalhe de produto, checkout do coach, pop-up de compra aprovada, carrinho público, modal de produto público) e depois varrer os demais modais escritos à mão, incluindo os que hoje não têm margem de segurança (perfil do aluno, desafios, indicações, gavetas de admin).
5. Garantir que todo modal tenha um botão X visível no topo fixo.

## Verificação

Conferir em 360x740 (S20), 360x640, 390x844 e 430x932, com o teclado fechado e aberto: o X visível no topo, o conteúdo rolando por dentro e o botão principal clicável — nos modais de carrinho, pagamento, produto e compra aprovada.

## Detalhes técnicos

- Novo hook/efeito global (montado no root) que escreve `--vvh` a partir de `window.visualViewport.height` com fallback `100dvh`; usado como `max-height: calc(var(--vvh) - 1.5rem - safe-areas)`.
- `src/styles.css`: `.modal-safe` deixa de rolar (`overflow: hidden`, `items-center`); `.modal-safe > *` recebe o teto acima com `display:flex; flex-direction:column` e o corpo rola.
- Substituir `max-h-[90vh]`/`max-h-[85vh]` nos cartões por a classe padrão; header `sticky top-0 bg-card` e footer `sticky bottom-0 bg-card` nos modais da loja.
- Reaproveitar/estender `src/components/ui/ModalShell.tsx` com a mesma medida, mantendo o comportamento de não fechar ao clicar fora.
- Sem mudanças de lógica de negócio, preço, comissão ou pagamento — apenas apresentação.
