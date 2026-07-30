## Problema

No `SupportCoachFab.tsx`, o botão X do balão chama `setVisible(false)`, o que remove o componente inteiro — some o balão e o botão flutuante do WhatsApp.

## Correção

Em `src/components/support/SupportCoachFab.tsx`:

1. O X passa a chamar apenas `setExpanded(false)` — fecha só o texto, o ícone verde do WhatsApp continua na tela.
2. Remover o estado `visible` (não há mais nada que oculte o botão inteiro).
3. O balão aparece automaticamente ao abrir o painel e se recolhe sozinho após ~6 segundos (timer cancelado se o usuário interagir); depois disso, clicar no ícone reabre/recolhe manualmente.
4. `aria-label` do X passa a ser "Fechar mensagem".

Nada mais muda: o link de WhatsApp, o patrocinador e o posicionamento seguem iguais.