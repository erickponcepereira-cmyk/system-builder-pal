# Correção de modais em telas pequenas + ícone do PWA no iPhone

## 1. Modais cortados / botões fora da área de clique

Hoje existem dois tipos de modal no sistema:

- Modais que usam o componente padrão (`Dialog`), que já tem limite de altura e rolagem.
- Cerca de 70 modais escritos "à mão" com `fixed inset-0 ... flex items-center justify-center` e um cartão interno. Esses são os que quebram: quando o conteúdo é maior que a tela do celular, o cartão cresce para cima e para baixo, e os botões de ação (Salvar / Confirmar / Fechar) saem da área visível e não podem ser clicados. Exemplos citados: modal de Pagamentos no admin e o modal de Desafio Pessoal em Meu Treino.

### O que será feito

Criar um único componente de moldura de modal (`ModalShell`) que garante, em qualquer tamanho de tela:

- Ocupa no máximo a altura visível do aparelho, descontando as áreas seguras do iPhone (notch e barra inferior).
- O conteúdo rola dentro do modal; cabeçalho e rodapé com botões ficam sempre visíveis.
- Largura limitada e com margem lateral, para não encostar nas bordas.
- Em celular, o modal aparece ancorado na parte de baixo (mais fácil de alcançar com o polegar); em telas maiores, centralizado.

Depois, substituir a moldura dos modais feitos à mão por esse componente, começando pelos painéis mais usados:

1. Admin: pagamentos/financeiro, assinaturas, alunos, coaches, gratuitos, desafio, carteiras, biblioteca, eventos.
2. Aluno: meu treino (desafio pessoal), perfil, evolução, loja, produto, gratuitos, reservas, indicação.
3. Coach: carteira, avaliar, protocolo, desafio, aprovações.
4. Parceiro / Profissional: carteira, produtos, colaboradores, membros, detalhes de cliente/aluno.
5. Compartilhados: co-produção, colaboração, CRM, recorte de imagem, seletor de função.

Também será ajustado o componente padrão `Dialog` para usar as mesmas regras de área segura, para que os modais que já o utilizam se comportem igual.

### Verificação

Conferir os modais em larguras de 320px, 360px, 390px e 430px (iPhone SE até iPhone Pro Max) garantindo que o botão principal continua clicável em todos.

## 2. Ícone do PWA no iPhone aparecendo branco

O arquivo de ícone atual é adequado (fundo escuro, sem transparência), mas duas coisas atrapalham no iOS:

- O tema dinâmico reescreve, em tempo de execução, o endereço das tags de ícone da página — incluindo a do iPhone (`apple-touch-icon`) — apontando para o favicon da marca, que em alguns casos é uma imagem clara/transparente. É esse endereço que o iPhone captura na hora de "Adicionar à Tela de Início".
- Só existe uma imagem de 1024px declarada em vários tamanhos; o iOS prefere um arquivo dedicado de 180x180 sem transparência.

### O que será feito

- Gerar um ícone dedicado de 180x180 (e um de 192 e um de 512) a partir da arte preta e vermelha usada no Android, achatado sobre fundo sólido escuro (sem canal alpha).
- Apontar a tag `apple-touch-icon` para esse arquivo fixo e impedir que o tema dinâmico sobrescreva essa tag (o tema continua trocando apenas o favicon do navegador).
- Atualizar o manifesto para referenciar os tamanhos corretos de cada arquivo.

Observação: quem já adicionou o app à tela de início precisa remover e adicionar novamente para ver o ícone novo — o iOS guarda o ícone no momento da instalação.

## Detalhes técnicos

- Novo `src/components/ui/ModalShell.tsx`: `fixed inset-0` + overlay, container com `max-h-[100dvh]` menos `env(safe-area-inset-top/bottom)`, `grid-rows-[auto_minmax(0,1fr)_auto]`, corpo com `overflow-y-auto overscroll-contain`, rodapé `sticky` com `pb-[env(safe-area-inset-bottom)]`, `items-end sm:items-center`, `w-[calc(100%-1rem)] max-w-lg`.
- Mantido o comportamento atual de não fechar ao clicar fora nem com ESC.
- `src/components/ui/dialog.tsx`: `DialogContent` passa a usar as mesmas medidas de área segura.
- `src/components/theme-provider.tsx`: o seletor que reescreve ícones deixa de incluir `link[rel="apple-touch-icon"]`.
- `src/routes/__root.tsx` e `public/manifest.webmanifest`: novos arquivos `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png` (RGB, sem alpha).
