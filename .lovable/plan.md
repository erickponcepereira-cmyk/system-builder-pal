Simplificar o botão flutuante de suporte do patrocinador (`SupportCoachFab`) para um FAB compacto que expande/colapsa e sempre reaparece ao entrar novamente no sistema.

### Alterações
1. **Remover persistência de fechamento**
   - Apagar a constante `DISMISS_KEY` e o `useEffect` que lê/escreve em `sessionStorage`.
   - O botão deve iniciar sempre visível/expandido (ou visível e pronto para expandir) quando a sessão carrega; ao fechar, esconde apenas na sessão atual e reaparece no próximo login/recarregamento.

2. **Redesenhar o botão**
   - Ícone do WhatsApp/MessageCircle como botão circular flutuante principal.
   - Sem texto fixo longo; o texto "Dúvidas? Fale com seu coach" aparece apenas quando o balão está expandido.
   - Botão de fechar (X) dentro do balão expandido para esconder o componente.

3. **Comportamento de aparecer/sumir (toggle)**
   - Clique no FAB alterna entre estado expandido (mostra balão + opção de fechar) e recolhido (só o ícone).
   - Clicar no link do WhatsApp não fecha o botão; clicar no X fecha.
   - Ao recarregar a página ou fazer logout/login, o botão volta a aparecer.

### Arquivos afetados
- `src/components/support/SupportCoachFab.tsx` — reescrita do componente.
- `src/routes/_authenticated/route.tsx` — sem alteração, continua montando o componente no layout.

### Não incluído
- Nenhuma mudança na lógica de resolução do patrocinador (`getMySponsorContact`), no link do WhatsApp ou na mensagem enviada.