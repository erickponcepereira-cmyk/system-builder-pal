## Problema

Modais (novo produto do parceiro/profissional e outros) fecham quando clica fora da área. Também podem fechar via ESC. Usuário quer que só o botão X (ou botões explícitos "Cancelar/Salvar") feche.

## Correção — mudança única em `src/components/ui/dialog.tsx`

Como todos os modais do sistema usam esse `DialogContent` compartilhado, um único ajuste corrige globalmente parceiro, profissional, admin, aluno, etc.

Alterar `DialogContent` para bloquear fechamento por clique fora e por ESC, mantendo o botão X e chamadas programáticas (`setOpen(false)`, `<DialogClose />`) funcionando normalmente:

```tsx
<DialogPrimitive.Content
  ref={ref}
  onPointerDownOutside={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
  onEscapeKeyDown={(e) => e.preventDefault()}
  className={...}
  {...props}  // continua permitindo override caso um modal específico queira reativar
>
```

Como o spread `{...props}` vem depois, qualquer diálogo que precise do comportamento antigo pode passar seus próprios handlers e sobrescrever.

## Fora de escopo

- Não mexer em `AlertDialog` (já é modal "forçado" por natureza — decisão sim/não).
- Não mexer em `Sheet`, `Drawer`, `Popover` — só o `Dialog`, que é o que aparece nos "novos produto" e nos modais de cadastro.
- Sem mudanças de layout/visual, sem mudanças de lógica de negócio.

## Verificação

- Abrir modal de novo produto no painel parceiro e no profissional; clicar fora → deve permanecer aberto; ESC → permanecer aberto; X → fecha; Cancelar/Salvar → fecha.