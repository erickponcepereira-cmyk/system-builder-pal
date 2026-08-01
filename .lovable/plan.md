# Corrigir os modais que ficaram quebrados

O ajuste anterior deixou os modais piores: em vários deles não dá para ler o conteúdo, rolar nem alcançar os botões de fechar/confirmar.

## Causa

No CSS global foi adicionada uma regra que se aplica ao cartão interno de todo modal marcado como `modal-safe`:

```text
.modal-safe > * { max-height: none; flex-shrink: 0; }
```

Ela **anula** o limite de altura que cada modal já tinha (`max-h-[90vh]`, `max-h-[65vh]` etc. — usados em 45 arquivos). Sem esse limite, o cartão cresce além da tela, a rolagem interna deixa de existir e cabeçalho/rodapé saem da área de clique. Somado a isso, o script em massa gerou classes duplicadas e conflitantes em alguns arquivos (por exemplo `items-start sm:items-start sm:items-center`, `overflow-y-auto overflow-y-auto`), o que deixa o alinhamento imprevisível.

## O que será feito

1. Remover a regra global destrutiva do `src/styles.css`. O `modal-safe` volta a ser apenas margem de segurança (notch/barra inferior) + rolagem suave, sem mexer na altura dos cartões.
2. No lugar dela, aplicar uma regra segura: o overlay `modal-safe` rola verticalmente e o cartão interno recebe altura máxima igual à tela útil (`100dvh` menos as áreas seguras), permitindo rolagem interna em vez de estouro.
3. Limpar as classes duplicadas/conflitantes geradas pelo script em massa nos ~70 arquivos de modal, padronizando o overlay em uma única forma: centralizado no desktop, ancorado ao topo com rolagem no celular.
4. Reverter alterações de alinhamento em modais pequenos (confirmações, avisos) que ficaram estranhos colados no topo — eles voltam a ficar centralizados.
5. Verificar visualmente os modais citados (Admin → Pagamentos/Mensalidade, Aluno → Meu Treino → Desafio Pessoal, e mais alguns representativos) em 320px, 390px e 430px de largura, confirmando que dá para rolar o conteúdo e clicar em fechar e no botão principal.

## Detalhes técnicos

- `src/styles.css`: apagar `.modal-safe > *:not(script):not(style) { max-height: none; flex-shrink: 0; }`; manter o `@utility modal-safe` com os paddings de safe-area e acrescentar `.modal-safe > *:not(script):not(style) { max-height: calc(100dvh - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }` apenas como teto (sem `flex-shrink`), preservando qualquer `max-h-*` menor definido no componente.
- Passada de limpeza de classes duplicadas nos arquivos que contêm `modal-safe` (dedupe de `items-start`, `sm:items-center`, `overflow-y-auto`).
- `src/components/ui/dialog.tsx` permanece como está (já usa `max-h` com `dvh` + safe-area e rolagem interna).
- Sem mudanças de lógica ou de dados — apenas apresentação.
