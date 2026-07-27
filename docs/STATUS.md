# FitMind Club — STATUS

> Registro vivo. Leia antes de começar. Atualize ao terminar cada bloco.
> Ultima atualizacao: 26/07/2026

## Ambiente

| Item | Estado |
|---|---|
| Repo | `C:\dev\fitmind` — branch `feat/mobile-shell` |
| Node / bun | v24.17.0 / 1.3.14 (o projeto usa **bun**, nao npm) |
| Banco | Supabase DENTRO do Lovable Cloud. Nao ha conta Supabase propria |
| Acesso SQL | Editor SQL da Lovable (Nuvem > Editor SQL). Nao ha connection string |
| Dominio | `fitmindclub.com.br` ativo, DNS verificado (A -> 185.158.133.1) |
| appId | `br.com.fitmindclub` (era `app.lovable.fitmind`) |

**Aviso de ferramenta:** o editor SQL da Lovable trava com texto longo via
automacao. Queries curtas funcionam. Modais (Connect domain, etc.) so abrem
com clique humano.

---

## SEGURANCA — verificado empiricamente com `SET LOCAL ROLE anon`

| tabela | resultado |
|---|---|
| `coaches` | **VAZANDO** — 53 linhas legiveis, **9 chaves PIX expostas** |
| `profiles` | permissao negada — NAO vaza |
| `anamnesis_forms` | protegida hoje |
| `coach_body_assessments` | protegida hoje |

### Correcoes ao relatorio anterior do chat de bugs
1. O vazamento de `profiles` com nome e email **NAO reproduz**. `anon` recebe
   permissao negada.
2. O vazamento real e em `coaches`, que ele nao encontrou. Contem `pix_key`,
   `bank_account`, `bank_agency`, `bank_name`.
3. As ~200 policies do banco sao TODAS `{public}`. Isso NAO e o bug em si —
   a maioria e segura porque o `USING` exige `auth.uid()`, que e NULL para
   anonimo. Corrigir as 200 seria enorme e arriscado. So importam as que tem
   `USING` permissivo.

### NAO APLICAR: `docs/propostas/loja-publica-e-vazamento.sql`
As policies das tabelas medicas fazem subconsulta em `profiles`. Como `anon`
nao le `profiles`, elas quebram com erro em vez de vazar — a protecao atual e
acidental. O `GRANT SELECT (id,name,avatar_url) ON profiles TO anon` proposto
**destrava essa porta**. As policies medicas passariam a avaliar de verdade,
e ninguem auditou o `USING` delas. A correcao proposta pode vazar mais.

### Ordem correta
1. `coaches` primeiro: revogar acesso de `anon` a `pix_key`, `bank_account`,
   `bank_agency`, `bank_name`. Cirurgico, independente de tudo.
2. Auditar o `USING` de toda policy que depende de `profiles`.
3. So entao abrir `profiles` para a loja publica.

---

## FINANCEIRO — conclusoes verificadas

### A causa raiz do "carteiras nao batem com relatorios"
Existem DOIS registros de carteira para a mesma pessoa, discordando.
Exemplo real, perfil `d0f05985`:

```
wallets               disponivel 404,58   ganho 404,58   sacado 100,00
professional_wallets  disponivel   0,00   ganho   0,00   sacado   0,00
```

O app le `professional_wallets` (coach ve R$ 0,00 — correto).
Relatorios de admin somam `wallets` (ve R$ 404,58 — fantasma).
**Nao ha dinheiro perdido nem risco de saque duplo.** E registro desatualizado.

### A auditoria de carteiras esta MORTA desde que foi criada
`wallets_audit_invariant` e um trigger que tenta gravar em `admin_audit_log`
usando `actor_id, target_type, target_id, metadata`. **Quatro dessas cinco
colunas nao existem.** As reais sao `actor_profile_id, action,
target_profile_id, notes`. O INSERT sempre falhou, e o
`EXCEPTION WHEN OTHERS THEN NULL` engoliu o erro para sempre.
Alem disso `prosecdef = false` — sem SECURITY DEFINER o INSERT bateria no RLS
mesmo com os nomes certos.

### Invariante: 7 perfis divergem
Padrao: `disponivel` sempre igual a `ganho`; diferenca sempre igual a
`pendente + sacado`. Causa: `total_earned` conta so comissao *disponivel*,
nao a pendente. Questao de definicao, baixa gravidade — mas o "total ganho"
exibido ao coach encolhe quando ele saca.

### Bug aberto: `store_orders`
51 pedidos com `status='paid'` mas so 16 com `paid_at`. Relatorio por status
mostra 51; por `paid_at` mostra 16. INVESTIGAR antes de mexer em checkout.

### Nutricionista / professor
O motor de distribuicao e `product_value_slots` + `payment_fee_configs`.
A coluna `products.nutritionist_fee` e **LEGADO MORTO — nao use**.
A Adesao Anual (R$179,90) distribui: Nutricionista master R$20, Sistema R$20,
Professor do curso R$49,90, Linha 1/2/3, sobra ao vendedor R$63,57.
`professor_wallets` tem 0 linhas: nunca foi atribuido nutricionista no admin.

### Volumes reais
107 usuarios. 163 tabelas. Receita de loja com baixa: R$ 5.019,80.
49 pedidos `pending` somando R$ 31.430 (carrinhos abandonados).
Comissoes: ~R$ 2.537. Saques pagos: R$ 817,07.
Zero registros marcados `is_test` em toda a base.

---

## LIMPEZA (nao urgente)
Quatro tabelas com 0 uso real e **0 linhas**: `food_logs`,
`points_redeem_orders`, `room_rentals`, `saved_payment_cards`.
Procedimento: renomear para `zz_descontinuada_<nome>`, esperar um ciclo,
so entao apagar. NUNCA `DROP` direto — o banco e producao.
`saved_payment_cards` e prioridade: o chat de features pode "reaproveitar"
essa tabela fantasma para cartao salvo.

---

## LGPD
- `test_accounts.default_password` — senha em texto puro no banco
- Senha temporaria de usuaria real em texto puro no historico do chat Lovable
- `.env` versionado no git (so chaves publicas, mas deve sair)
- RLS habilitado em 163/163 tabelas
- Scanner da Lovable aponta 9 problemas (painel Seguranca) — nao auditados

---

## LICOES (para os outros chats nao repeterem meus erros)
Errei quatro vezes hoje pelo mesmo motivo: concluir a partir de uma parte do
schema sem ler o resto.
1. Supus que as 6 carteiras eram duplicacao acidental. Sao contas contabeis
   distintas, intencionais.
2. Supus que `pending_balance` e `blocked_balance` eram o mesmo conceito com
   nomes diferentes. Sao coisas diferentes (tempo vs entrega).
3. Diagnostiquei pela coluna `products.nutritionist_fee` sem ver que o motor
   real era `product_value_slots`.
4. Somei pedidos sem filtrar status e chamei carrinho abandonado de buraco
   financeiro.

**Regra: rode a query antes de afirmar. O banco responde mais rapido do que
custa desfazer uma conclusao errada.**
