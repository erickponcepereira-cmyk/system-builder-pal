# Contraste no white label + gerador de paleta no Admin

Duas frentes: consertar o contraste do tema da Carol Aventureira (e de qualquer tema claro) e dar ao Admin uma forma simples de montar a paleta escolhendo modo (claro/escuro) e 2–3 cores principais.

## 1. Por que está tudo rosa lavado hoje

O tema "Carol Aventureira" está com as superfícies quase idênticas: fundo `#FFC1D8`, cartão `#FFE8F0`, neutro `#FFE3EC`. Como cartão, fundo e neutro têm quase a mesma luminosidade, some a separação entre as áreas.

Além disso, a aba de Corrida foi feita pensando no tema escuro: os escudos de nível usam `border-white/5 bg-white/[0.02]` (branco translúcido, que desaparece sobre rosa claro) e os níveis ainda não alcançados ficam com `opacity-35 grayscale` — no fundo claro isso vira quase invisível, exatamente o que aparece no print.

## 2. Correções de contraste

- Aba de Corrida (`RunningTab`): trocar os overlays brancos por tokens semânticos (`bg-muted`, `border-border`), subir a opacidade dos níveis bloqueados de 35% para ~60% e dar contorno visível ao escudo; garantir que o ícone dentro do escudo escolha texto claro ou escuro conforme a luminosidade da cor do nível (hoje só trata o branco `#F5F5F5`). Barra de progresso e anel também ganham trilho com contraste real.
- Regravar o tema da Carol com a paleta gerada pelo novo motor (fundo rosa bem claro, cartão branco, texto vinho escuro, primária magenta, bordas visíveis), mantendo a identidade rosa.
- Passar um pente-fino nos outros temas claros já cadastrados ("Divas Power", "Metralha") sinalizando no Admin os que estiverem fora do contraste mínimo.

## 3. Admin → Identidade visual: modo automático

Na tela de tema, antes da lista longa de 25 cores, entra um bloco **"Montar paleta"**:

- Seletor **Tema claro / Tema escuro**.
- **Cor principal** (obrigatória), **cor de apoio** (opcional) e **cor de destaque** (opcional) — três seletores de cor.
- Botão **Gerar paleta**: preenche automaticamente as 25 variáveis (fundo, cartão, popover, neutro, borda, campo, menu lateral e todos os textos correspondentes) a partir dessas 2–3 cores e do modo escolhido.
- Botão **Ajustar manualmente**: a lista completa de cores continua existindo, agora recolhida por padrão. Quem quiser afinar um token específico abre e edita — o automático nunca sobrescreve sem clique.

### Como o gerador decide as cores

- Converte a cor principal para HSL e deriva superfícies com o mesmo matiz, mas com luminosidade travada por faixas: no tema claro, fundo bem claro (~96%), cartão quase branco (~99%), neutro intermediário, borda perceptível; no escuro, o espelho disso.
- Cada cor de texto é escolhida entre a versão clara e a escura, sempre a que tiver maior contraste sobre o fundo em que vai aparecer (alvo WCAG AA: 4.5:1 para texto, 3:1 para bordas/superfícies).
- Cor de apoio vira secundária/menu; cor de destaque vira `accent` e `ring`; se não forem informadas, saem por derivação da principal.
- A cor da barra do navegador acompanha o fundo.

### Conferência na hora

A prévia atual ganha:
- amostra de texto normal, texto neutro, cartão, botão primário e um chip de destaque;
- **selo de contraste** por par crítico (texto/fundo, texto do cartão/cartão, texto sobre primária/primária, borda/fundo) mostrando a razão calculada e um aviso em vermelho quando ficar abaixo do mínimo;
- botão **"Corrigir contraste"**, que ajusta só os tokens reprovados sem mexer no resto.

## Detalhes técnicos

- Novo `src/lib/palette.ts`: utilitários puros — `hexToHsl`/`hslToHex`, `relativeLuminance`, `contrastRatio`, `bestForeground`, `gerarPaleta({ mode, primaria, apoio?, destaque? })` retornando o objeto completo de tokens no formato de `TemaMarcaInput`, e `auditarContraste(tema)` devolvendo os pares reprovados.
- `src/routes/_authenticated/admin.branding.tsx`: bloco "Montar paleta" + lista de 25 campos dentro de um `<details>` recolhido; prévia ampliada com selos de contraste e botão de correção. Nenhuma mudança no schema nem nas server functions — o gerador só preenche o mesmo `TemaMarcaInput` que já é salvo.
- `src/components/student/running/RunningTab.tsx`: substituição dos utilitários `white/x` por tokens semânticos e ajuste do `LevelShield` (contorno, opacidade, cor do ícone por luminosidade).
- Tema da Carol atualizado por migração `UPDATE public.brand_themes` com os valores gerados (sem mudança de estrutura).
