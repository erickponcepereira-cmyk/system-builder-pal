## Objetivo

Permitir que parceiros publiquem produtos **gratuitos** com agenda recorrente (dias da semana + janelas de horário), capacidade por slot e limite de uso por aluno (X vezes por semana de calendário). Aluno reserva, recebe QR único do slot e parceiro dá baixa lendo o QR.

## Modelo de dados (migrations)

1. `partner_products.is_free` já existe — adicionar:
   - `weekly_limit_per_student int default 1` (quantas vezes/semana o mesmo aluno pode usar)
   - `default_slot_capacity int default 1`
2. Nova tabela `partner_product_schedules`
   - `partner_product_id`, `weekday smallint (0=dom..6=sáb)`, `start_time time`, `end_time time`, `capacity int`, `active bool`
3. Nova tabela `partner_freebie_reservations`
   - `id`, `partner_product_id`, `partner_id`, `student_id`, `profile_id`, `slot_date date`, `slot_start timestamptz`, `slot_end timestamptz`, `weekday`, `iso_week text` (ex `2026-W27`), `status` enum(`reserved`,`used`,`cancelled`,`expired`), `qr_token text unique`, `used_at timestamptz`, `scanned_by_profile_id`
   - Índices: (`partner_product_id`,`slot_start`), (`student_id`,`iso_week`)
4. RPCs:
   - `list_partner_freebie_slots(_product_id, _from, _to)` → calcula slots a partir das `schedules` + ocupação atual; devolve `{ slot_start, slot_end, capacity, taken, remaining }`
   - `reserve_partner_freebie(_product_id, _slot_start)` → valida janela, capacidade, limite semanal do aluno (ISO week, segunda 00h tz BR); cria reserva + qr_token (uuid); retorna `{ reservation_id, qr_token, slot_end }`
   - `redeem_partner_freebie(_qr_token)` (chamada pelo parceiro logado) → valida posse do partner, status `reserved`, `now() between slot_start-15min and slot_end`; marca `used`. Idempotente: se já `used`, retorna erro.
   - `cancel_partner_freebie(_reservation_id)` → aluno cancela enquanto `reserved` e antes do `slot_start`.
5. RLS:
   - schedules: select público (autenticados); manage = dono partner / admin.
   - reservations: select = aluno dono OU parceiro dono OU admin; insert via RPC; update somente via RPC.

## Backend (server functions)

`src/lib/partner-freebies.functions.ts`
- `listFreebieSlotsFn`, `reserveFreebieFn`, `cancelFreebieFn`, `redeemFreebieFn`, `getMyFreebieReservationsFn` (com status + qr_token)
- `getPartnerFreebieUsageFn` (para painel parceiro: hoje/semana)

## UI Parceiro

`src/components/partner/PartnerProductsPanel.tsx` (form de produto gratuito):
- Toggle existente "Gratuito" já liga `is_free`.
- Quando gratuito: novo bloco **"Disponibilidade"** parecido com o editor por dia já usado em `ProfessionalProductsPanel`:
  - Para cada dia da semana: lista de janelas (start–end) + `capacity` (vagas) por janela
  - Campo `weekly_limit_per_student` (default 2)
- Persiste em `partner_product_schedules` (replace-all on save).

Novo painel `PartnerFreebieScanner.tsx` no portal parceiro:
- Botão "Ler QR" → reaproveita `QRScannerModal`
- Lê token → chama `redeemFreebieFn` → toast com nome do aluno + produto + slot; se inválido/expirado, mensagem clara
- Lista "Próximas reservas hoje" com status e contador (remaining no slot).

## UI Aluno

`src/routes/_authenticated/student.freebies.tsx`:
- Card de freebie de parceiro com agenda passa a abrir modal **"Reservar horário"**:
  - Calendário (mesmo padrão visual do `AvailabilityPicker`) com slots vindos de `list_partner_freebie_slots`
  - Mostra "X vagas restantes" por slot
  - Mostra "Você já usou Y/Z esta semana" e bloqueia quando ≥ limite
  - Botão "Confirmar reserva" → `reserveFreebieFn`
- Nova rota `student.freebies.reservation.$id.tsx` (ou modal dentro da lista):
  - Mostra QR Code (gerado client-side com `qrcode` lib já no projeto) com o `qr_token`
  - Janela do slot, endereço do parceiro, botão "Cancelar reserva"
  - Estado em tempo real: ao ser `used`, troca para "Check-in realizado ✓" (polling 10s ou realtime)
- Aba "Minhas reservas" listando próximas e histórico.

## Regras finais
- Limite semanal: ISO week em timezone `America/Sao_Paulo`, reset segunda 00h.
- Reserva conta no limite no momento da criação; cancelar libera a vaga e o uso semanal.
- Reservas `reserved` cujo `slot_end < now()` viram `expired` (job cron diário `expire_old_freebie_reservations`, devolve uso semanal só se não foi `used`).
- QR token = UUID v4 único; URL não-adivinhável `/partner-checkin/freebie/<token>` (parceiro pode abrir direto pelo scanner).

## Entrega faseada
**Fase 1 (esta resposta):** migrations + RPCs + RLS + server functions + painel parceiro (schedules + scanner) + reserva e QR do aluno.
**Fase 2 (próxima):** cron de expiração, aba "Minhas reservas" completa, realtime para baixa instantânea.

Tudo respeita visual atual (#FF4A3D / fundo escuro) e padrões já usados em `AvailabilityPicker` e `QRScannerModal`.