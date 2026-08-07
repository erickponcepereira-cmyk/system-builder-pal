# Corrigir o modal da loja no POCO X6 sem afetar outros aparelhos

## Problema confirmado

A captura corresponde ao detalhe de produto de Parceiro/Profissional em `PartnerProfessionalStore`. Esse modal ainda tem uma implementação própria:

- o botão “X” fica sobre a imagem e rola junto com todo o conteúdo;
- o cartão usa `max-h-[92vh]`, enquanto uma regra global tenta substituir essa altura usando `--vvh`;
- overlay e cartão possuem regras de rolagem concorrentes;
- diferentemente do detalhe da loja principal, ele não usa `ModalShell`, que já separa cabeçalho, corpo rolável e rodapé.

Por isso a correção global anterior não resolve de forma estável o modal mostrado no POCO X6.

## O que será feito

1. Corrigir **somente** o modal de detalhe de Parceiro/Profissional da captura, sem alterar `modal-safe`, `--vvh` ou regras globais.
2. Migrar esse modal para uma estrutura local de três partes:
   - cabeçalho fixo com nome e botão “X” sempre visível;
   - corpo com rolagem própria contendo imagem, preço, descrição, comissões e agendamento;
   - rodapé fixo com “Esgotado”, “Adicionar ao carrinho” ou botões de compra.
3. Para a faixa estreita do POCO X6, usar a altura visível real do aparelho, remover a centralização vertical e ocupar a largura disponível com margens seguras. Em telas maiores, manter o modal centralizado e com o visual atual.
4. Não detectar marca/modelo pelo navegador: a correção será ativada pelas dimensões efetivas do POCO X6, o que também protege aparelhos com a mesma tela sem criar comportamento frágil por fabricante.
5. Preservar a regra atual de não fechar ao tocar fora do modal.

## Verificação

- Reproduzir o detalhe do “Aulão de Jump” em viewport equivalente ao POCO X6, com barras do Chrome abertas e recolhidas.
- Confirmar que o “X” permanece visível, o conteúdo rola por dentro e o botão inferior permanece clicável.
- Conferir o mesmo modal em 360x740 (Galaxy S20), 390x844 e desktop para garantir que a correção local não alterou os outros layouts.
- Validar os estados esgotado, disponível, produto agendável e checkout PIX/cartão.

## Detalhes técnicos

- Arquivo principal: `src/components/store/PartnerProfessionalStore.tsx`.
- Reaproveitar `ModalShell` ou uma composição equivalente exclusivamente nesse componente.
- Remover desse modal o `max-h-[92vh]` e a dupla rolagem; manter apenas o corpo central com `overflow-y-auto`.
- Cabeçalho e rodapé serão `shrink-0`; o corpo será `min-h-0 flex-1`.
- Nenhuma mudança em banco de dados, estoque, preço, comissão, checkout ou nos demais modais.