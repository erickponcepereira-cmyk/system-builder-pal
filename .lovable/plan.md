## Objetivo

Continuar o MLM aplicando as regras combinadas:
- Parceiros e profissionais da saúde entram na rede MLM como "coaches" da estrutura.
- Eles viram o coach dos próprios colaboradores (alunos vinculados ao CNPJ/CPF deles).
- Vendas dos colaboradores distribuem comissão normalmente subindo pela rede a partir do parceiro/profissional.
- Quando o parceiro ou profissional compra individualmente (para si mesmo), a comissão "de coach" vai para o upline que o trouxe (a empresa/coach que o cadastrou).

## Estado atual (já existe)

- `coaches.is_professional = true` — profissionais já viram coach.
- `partners.upline_coach_id` — parceiros já têm upline, mas NÃO têm linha em `coaches`, então a função `process_paid_transaction` não consegue subir comissões pela rede do parceiro.
- `students.partner_id` — link de colaborador→empresa já existe; falta usar como coach default.
- `process_paid_transaction` percorre `coaches.upline_coach_id` para níveis 1/2/3.

## Mudanças

### 1. Backend / DB (migration)

a. **Espelhar parceiro como coach**
- Adicionar trigger `AFTER INSERT/UPDATE` em `public.partners` que cria/atualiza uma linha em `coaches` para o mesmo `profile_id` com:
  - `upline_coach_id = partners.upline_coach_id`
  - `is_professional = false`, `approved_at = partners.approved_at`
  - `referral_code` único (gerado se necessário)
- Backfill: criar coach para todos parceiros aprovados existentes.

b. **Colaboradores entram com coach = parceiro/profissional**
- Função `public.resolve_collaborator_coach(_partner_id uuid)` retorna o `coaches.id` do parceiro (cria sob demanda no backfill).
- Quando um aluno é criado com `partner_id` setado e `coach_id` nulo, atribuir `coach_id` ao coach espelho do parceiro (trigger BEFORE INSERT em `students`).

c. **Auto-compra do parceiro/profissional**
- Quando o próprio parceiro/profissional compra algo: ele é student dele mesmo? Hoje não. Solução: garantir linha em `students` para profile do parceiro/profissional (trigger no insert em `coaches` quando `is_professional=true` ou no trigger de parceiro→coach). Esse student tem `coach_id = upline` (quem o trouxe), para que `process_paid_transaction` distribua corretamente: nível 0 (coach) vai para o upline, e a rede sobe a partir dali.

d. **Sem mudanças em `process_paid_transaction`** — a lógica atual já funciona se as estruturas acima existirem.

### 2. Frontend

- Em `ProfessionalRegistration` e fluxo de cadastro de parceiros: nada novo de UI; trigger faz o trabalho.
- Painel de parceiro/profissional: garantir aba "Minha rede" mostrando colaboradores (alunos com `partner_id = meu_id` ou `coach_id = meu_coach_id`) e comissões da rede pela `wallets` deles.

### 3. Validação

- Após migration, simular: criar profissional → comprar produto como ele mesmo → verificar que comissão coach foi para o upline dele.
- Criar colaborador (student com partner_id) → comprar → verificar comissão sobe pela rede (parceiro recebe nível 0, upline do parceiro recebe nível 1, etc.).

## Detalhe técnico

```sql
-- Trigger principal: espelhar parceiro como coach
CREATE OR REPLACE FUNCTION public.mirror_partner_as_coach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _coach_id uuid; _code text;
BEGIN
  SELECT id INTO _coach_id FROM coaches WHERE profile_id = NEW.profile_id;
  IF _coach_id IS NULL THEN
    _code := 'EMP' || upper(substring(md5(NEW.id::text), 1, 6));
    INSERT INTO coaches (profile_id, referral_code, upline_coach_id, approved_at, is_professional)
    VALUES (NEW.profile_id, _code, NEW.upline_coach_id, NEW.approved_at, false);
  ELSE
    UPDATE coaches SET upline_coach_id = COALESCE(upline_coach_id, NEW.upline_coach_id),
                       approved_at = COALESCE(approved_at, NEW.approved_at)
    WHERE id = _coach_id;
  END IF;
  RETURN NEW;
END $$;
```

E backfill equivalente para parceiros existentes e students faltantes.

## Fora de escopo (não mudar agora)

- Layout de painéis.
- Lógica de carteira/saque (já existente).
- Sistema de pontos.
