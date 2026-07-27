## Problema

No painel do aluno (`student.freebies.tsx`) existe o bloco **"Minhas reservas"** (`StudentFreebieReservations`), que lista as reservas de benefícios gratuitos e libera o QR Code quando chega o horário do slot.

Na aba **Benefícios** do coach (`src/components/coach/tabs/BenefitsTab.tsx`) esse bloco nunca foi incluído: o coach consegue abrir o modal de agendamento e reservar, mas depois não existe nenhum lugar no painel dele que mostre a reserva nem o QR Code — por isso "não aparece em lugar nenhum".

## O que será feito

1. **Listar reservas na aba Benefícios do coach**
   - Renderizar `StudentFreebieReservations` logo acima da lista de benefícios (mesma posição que no aluno), com `refreshKey` atualizado após cada reserva feita pelo modal de agendamento.
   - O componente já busca por `profile_id` do usuário logado, então funciona igual para coach, sem lógica nova.

2. **Estados e QR idênticos ao aluno**
   - "Aguardando horário" (com opção de cancelar), "QR disponível" ao entrar no slot, "Usado", "Expirado" e "Cancelado".
   - QR abre em modal e atualiza automaticamente quando o parceiro faz a leitura.

3. **Alinhar o critério de agendamento**
   - A aba do coach decide "agendar × resgatar direto" apenas pela existência de horários cadastrados; o aluno usa a flag `uses_scheduling` do produto. Passarei a buscar e usar `uses_scheduling` também no coach, para que produtos com agenda sempre abram o fluxo de reserva com QR.

4. **Verificação**
   - Conferir que as reservas criadas por um coach aparecem no scanner do parceiro (`PartnerFreebieScanner`) e nos relatórios, já que a reserva é a mesma tabela `partner_freebie_reservations`.

## Detalhes técnicos

- Arquivo principal: `src/components/coach/tabs/BenefitsTab.tsx` (reuso do componente existente, sem duplicação de código).
- Sem mudanças de banco previstas: as políticas de leitura de `partner_freebie_reservations` são por `profile_id`. Caso a verificação mostre que o coach não enxerga a própria reserva, adiciono a política correspondente numa migração.
