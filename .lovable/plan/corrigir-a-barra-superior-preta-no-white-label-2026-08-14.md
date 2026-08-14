# Corrigir a barra superior preta no white label

## O problema

No painel de Coach, a barra superior do celular tem a cor preta fixa no código (`rgba(10,10,10,0.94)`), enquanto o texto e os ícones seguem a cor do tema. Em temas claros — como o da Carol Aventureira, que tem fundo claro e texto escuro — o resultado é texto escuro sobre barra preta, praticamente ilegível.

Por isso não existe campo no "Editar identidade visual" que resolva: a barra ignora completamente as cores do tema. O tema da Carol já tem as cores de menu corretas cadastradas (menu claro, texto escuro); elas simplesmente não são usadas nessa barra.

## O que será feito

1. Barra superior do painel de Coach passa a usar as cores do tema (Menu lateral / Texto do menu / Borda do menu), com leve transparência e desfoque preservados. Assim ela fica escura em temas escuros e clara em temas claros, sempre legível.
2. O nome exibido na barra passa a ser o nome do tema (ex.: "Carol Aventureira") em vez de "FitMind Club" fixo, igual já acontece no painel do aluno.
3. Mesma correção nas barras superiores dos painéis de Parceiro e Profissional, que também têm cores escuras fixas e ficariam ilegíveis nos mesmos temas claros.
4. Sem mudanças de layout, navegação ou regras de negócio — apenas cor e contraste.

O painel de Admin continua com o visual escuro fixo (é área interna, não white label).

## Detalhes técnicos

- `src/routes/_authenticated/coach.tsx` (header mobile, linha ~322): trocar `backgroundColor: "rgba(10,10,10,0.94)"` por `color-mix(in srgb, var(--sidebar) 94%, transparent)` e aplicar `color: var(--sidebar-foreground)` no container, com a borda usando `var(--sidebar-border)`. Textos/ícones passam a herdar (`text-current` / classes `sidebar-foreground`) em vez de `text-foreground`.
- Substituir o literal "FitMind Club" pelo `theme.name` via `useBranding()` (hook já usado em `MobileShell`).
- `partner.tsx` (`#111` / `#141414` no topo) e `professional.tsx` (`#0F0F0F` no topo): mesma troca para tokens de sidebar, mantendo o restante do painel como está.
- Sem migração de banco: os tokens `sidebar*` já existem em `brand_themes` e já são aplicados em CSS por `theme-provider.tsx`.
