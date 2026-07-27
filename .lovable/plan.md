## Causa confirmada

Consultei o banco: os três produtos citados **têm agenda cadastrada**, mas estão com a flag de agendamento desligada:

| Parceiro | Janelas cadastradas | Flag `uses_scheduling` |
|---|---|---|
| Academia Move (2 produtos) | 10 / 5 | ligada |
| Estação Funcional | 3 | ligada |
| Iron Cross | 12 | **desligada** |
| Welington Bezerra (2 produtos) | 10 / 3 | **desligada** |
| Extremus Life Fitness | 17 | **desligada** |

O aluno/coach decide entre "reservar horário" e "QR na hora" por essa flag — por isso os três geram QR direto.

Por que ela desligou: no formulário de produto do parceiro (`partner.tsx`), o botão **Salvar** envia o objeto inteiro do estado local, incluindo `uses_scheduling` com o valor antigo (`false`) carregado quando o modal abriu. O editor de agenda (bloco separado, salvo com seu próprio botão) liga a flag no banco via gatilho; se o parceiro salvar a agenda e **depois** clicar em "Salvar" no produto, o update sobrescreve a flag de volta para `false`. Academia Move e Estação Funcional simplesmente não fizeram esse último clique.

## Correção

1. **Dados** — migração que recalcula `uses_scheduling` para todos os `partner_products`: ligada quando existir pelo menos uma janela ativa em `partner_product_schedules`, desligada quando não existir. Isso conserta Iron Cross, Welington Bezerra e Extremus imediatamente.

2. **Blindagem no banco** — gatilho `BEFORE INSERT/UPDATE` em `partner_products` que força `uses_scheduling` a refletir a existência de janelas, ignorando o valor enviado pelo cliente. Assim nenhum salvamento futuro (de qualquer tela) consegue desligar a flag de um produto que tem agenda.

3. **Frontend** — remover `uses_scheduling` do payload de update/insert em `src/routes/_authenticated/partner.tsx` (a flag passa a ser derivada da agenda, nunca digitada) e recarregar o produto em edição após salvar a agenda, para o estado local não ficar desatualizado.

4. **Verificação** — reconsultar os produtos após a migração e confirmar que os cinco benefícios com agenda ficam com a flag ligada, e que os produtos sem janelas (ex.: CF6800, Dr. Pé, Spazzio) continuam com QR direto.

## Detalhes técnicos

- Já existem os gatilhos `trg_sync_uses_scheduling_*` em `partner_product_schedules` e a função `set_partner_product_schedules` que atualiza a flag — o problema é só a sobrescrita vinda do update do produto, então o novo gatilho em `partner_products` fecha a única brecha restante.
- Nenhuma mudança em `reserve_partner_freebie`, no scanner do parceiro ou nos relatórios: o fluxo de reserva/QR já funciona quando a flag está correta.
