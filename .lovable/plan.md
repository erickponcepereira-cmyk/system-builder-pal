## Problemas identificados

**1. Coach não vê os dias/horários específicos** — `CoachBenefitsTab` só lê `benefit_start_time`/`benefit_end_time` (janela única legada). Produtos com múltiplas janelas por dia (tabela `partner_product_schedules`, ex. "Aula de Muay Thai") nunca são consultados, então o coach não vê nenhuma indicação de agenda.

**2. Aluno recebe "Perfil de aluno não encontrado"** — o RPC `reserve_partner_freebie` faz `SELECT id FROM students WHERE profile_id = auth.uid()` e lança essa exceção quando o usuário não tem registro em `students` (caso dos coaches/parceiros/profissionais que nunca foram criados como aluno).

**3. Reservas não aparecem na agenda do parceiro** — `FitmindCalendar` inclui `professional_appointments`, mas ignora completamente `partner_freebie_reservations`. O parceiro não vê os agendamentos que estão sendo feitos nos seus produtos.

## Correções

### 1. Mostrar dias/horários no card do coach (`src/components/coach/tabs/BenefitsTab.tsx`)

- Buscar em paralelo os `partner_product_schedules` (weekday, start_time, end_time, active) de todos os produtos exibidos e mapear por `partner_product_id`.
- No card, quando o produto tem schedules ativos, substituir a linha única "Disponível das … às …" por uma lista compacta agrupando por dia da semana, ex.: `Seg 07:00–08:00 · 08:00–09:00 | Qua 07:00–08:00 …`. Se não tiver schedules, mantém o comportamento atual com `benefit_start_time/end_time`.
- Continua usando `student_generate_partner_coupon` para produtos sem schedules; para produtos com schedules, o coach passa a abrir o mesmo modal de reserva usado pelo aluno (`PartnerFreebieBookingModal`) em vez de gerar cupom direto.

### 2. Corrigir "Perfil de aluno não encontrado" (migration Supabase)

Atualizar `public.reserve_partner_freebie` para, quando o usuário autenticado não tiver linha em `students`, criar uma automaticamente vinculada ao `profile_id` (mesmo padrão já usado em `registration.server.ts`) antes de prosseguir com a reserva. Nada muda para quem já é aluno.

### 3. Agenda do parceiro (`src/components/FitmindCalendar.tsx`)

- Adicionar uma nova fonte de eventos análoga a `professional_appointments`: para o parceiro logado, buscar `partner_freebie_reservations` (join com `partner_products(name)` e `students → profiles(name)`) filtradas por `partner_id` do parceiro atual e status `reserved`/`used`, no intervalo do mês visível.
- Mapear cada reserva para o mesmo shape `FitmindEvent` já usado por appointments (título = nome do produto, subtítulo = nome do aluno, `starts_at`/`ends_at` da reserva, `category: "aula"`), e concatenar no `setEvents([...base, ...challengeEvents, ...appointmentEvents, ...freebieEvents])`.
- Detectar o contexto de parceiro do mesmo jeito que já é feito para profissional (via `partners.profile_id = auth.uid()`), sem quebrar as demais telas (coach/aluno/profissional) que também usam `FitmindCalendar`.

## Detalhes técnicos

- Migration única alterando `reserve_partner_freebie` (mantém `SECURITY DEFINER`, mesmo `search_path`). Após o `SELECT ... INTO v_student_id`, adicionar `IF v_student_id IS NULL THEN INSERT INTO public.students(profile_id) VALUES (v_uid) RETURNING id INTO v_student_id; END IF;`.
- Query nova em `FitmindCalendar` só roda quando `partnerId` do usuário atual for encontrado; o restante das fontes fica intacto.
- No `BenefitsTab`, o fetch de schedules é uma consulta `.in("partner_product_id", ids)` após carregar os produtos, para não fazer N+1.

Preciso que crie a aba de localização para produtos gratuitos, quando o resgate é em um lugar diferente do cadastrado, esse link de localização deve aparecer quando o cliente clicar e abaixo do QR code com nome de localização. 