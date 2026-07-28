## Problema

Hoje o cancelamento de uma reserva de produto gratuito só existe dentro do modal de QR (`StudentFreebieReservations`), escondido atrás de um clique no card, e usa `window.confirm` — que em alguns navegadores/webview do app não abre, dando a sensação de "botão que não funciona". Na lista de reservas não há nenhum botão de cancelar.

A regra de backend (`cancel_partner_freebie`) já funciona: cancela apenas reservas com status `reserved` e somente antes do início do horário; caso contrário devolve erro.

## O que fazer (só frontend)

1. **Botão de cancelar na lista de reservas** (`src/components/student/StudentFreebieReservations.tsx`)
   - Em cada linha de reserva ainda cancelável (status `reserved` e horário ainda não iniciado), mostrar um botão "Cancelar" visível ao lado do status, sem precisar abrir o QR.
   - Trocar o `<button>` que envolve a linha inteira por um container, com área clicável para abrir o QR e o botão de cancelar separado (evita clique aninhado).

2. **Confirmação em modal próprio**
   - Substituir `window.confirm` por um diálogo de confirmação dentro do app ("Cancelar esta reserva? Você poderá reservar outro horário depois."), com botões Voltar / Cancelar reserva.
   - Estado de carregando no botão enquanto a chamada roda, evitando cliques duplos.

3. **Feedback claro**
   - Sucesso: toast "Reserva cancelada" e recarregar a lista.
   - Erro vindo do backend (ex.: horário já iniciado): mostrar a mensagem traduzida em toast e recarregar a lista para refletir o estado real.

4. **Mesmo comportamento no painel do coach**
   - O componente já é reutilizado em `BenefitsTab` (coach) e em `student.freebies`, então a correção vale para os dois painéis automaticamente. Verificar visualmente as duas telas.

## Detalhes técnicos

- Arquivo único alterado: `src/components/student/StudentFreebieReservations.tsx`.
- Continua usando `supabase.rpc("cancel_partner_freebie", { _reservation_id })`; nenhuma mudança de banco.
- `getReservationState` continua sendo a fonte da verdade para `canCancel`, agora consumido também pela lista.
