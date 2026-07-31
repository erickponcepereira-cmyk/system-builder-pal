# Registro de migrations fora do chat financeiro

O chat financeiro é o dono de `supabase/migrations/`. Este arquivo registra as
exceções autorizadas: migrations **que não tocam em dinheiro**, escritas por
outros chats, para que o financeiro saiba o que entrou sem precisar auditar o
diretório inteiro.

Regra combinada: migration sem dinheiro pode ser escrita fora do financeiro,
desde que (1) o chat financeiro seja avisado e (2) entre nesta tabela.

Nunca entram aqui: DDL sobre carteiras, comissões, faturas, assinaturas,
pagamentos, taxas, ou qualquer coluna de valor (`cost`, `commission_*`,
`tax_percentage`, `app_fee`, `coupon_code`). Isso continua exclusivo do
financeiro.

---

## 20260730190000_crm_infra.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 30/07/2026 |
| **Branch** | `feat/bugs` (clone `C:\dev\fitmind-bugs`) |
| **Toca em dinheiro?** | Não |
| **Aplicada em produção?** | **Sim — 30/07/2026**, pelo editor SQL do Lovable |

### O que cria

Motor de quadros estilo Trello, genérico e reaproveitável por qualquer painel.

Tabelas: `crm_quadros`, `crm_colunas`, `crm_etiquetas`, `crm_cartoes`,
`crm_cartao_etiquetas`, `crm_atividades`.

Funções: `crm_acesso_quadro(uuid)`, `crm_clonar_quadro(uuid, text, uuid, text)`,
`crm_touch_updated_at()`, `crm_registrar_mudanca_coluna()`.

### Por que não é financeira

Nenhuma tabela de dinheiro é lida ou alterada. O cartão do CRM referencia
`leads` e `profiles`, e nada mais. Não há valor, comissão, fatura nem carteira
em lugar nenhum do schema. Se o CRM um dia precisar mostrar o valor de um plano,
isso vira leitura via view/RPC do financeiro — não coluna nova aqui.

### Tabelas existentes que ela referencia (só como chave estrangeira)

- `public.profiles` — criador, responsável, dono de quadro de coach/profissional
- `public.leads` — vínculo opcional do cartão com um lead já cadastrado

Não altera nenhuma delas.

### Como o acesso funciona

Tudo passa por `crm_acesso_quadro(quadro_id)`, e as políticas só chamam essa
função. O quadro é ancorado em `(escopo, owner_id)`:

| escopo | quem enxerga |
|---|---|
| `parceiro` | `partner_pode(owner_id, 'crm')` — dono, quem tem a permissão `crm`, ou admin |
| `coach` | o profile dono é o usuário logado |
| `profissional` | o profile dono é o usuário logado |
| `admin` | `is_admin(auth.uid())` |

Reusa os helpers que já existiam (`partner_pode`, `is_admin`) em vez de criar
regra paralela. Segue a convenção do projeto: `auth.uid()` bate em
`profiles.user_id`, nunca em `profiles.id`.

**Permissão nova esperada em `partner_members.permissoes`:** `crm`. Quem for
`owner` do parceiro já passa sem precisar dela.

### Clonagem entre painéis

`crm_clonar_quadro(origem, escopo, owner_id, nome)` copia **estrutura**
(colunas + etiquetas), nunca cartões — dado de uma academia não entra na outra.
Quadros com `modelo = true` são visíveis a todos e servem de ponto de partida;
os demais só clonam com acesso à origem.

### Validação feita antes de subir

Rodada em PostgreSQL 16 local, com stubs de `profiles`, `partners`,
`partner_members`, `leads`, `is_admin` e `partner_pode`:

- aplicada duas vezes seguidas sem erro (idempotente)
- gatilho de mudança de etapa grava na linha do tempo
- `updated_at` se atualiza sozinho
- academia A não enxerga quadro, cartão nem consegue escrever na academia B
- funcionário sem a permissão `crm` não vê nada, mesmo sendo da academia
- clonagem entre painéis funciona; clonagem de quadro alheio é bloqueada

**Achado que essa validação pegou:** o projeto não recebe acesso automático ao
schema `public`. Sem `GRANT ... TO authenticated` explícito por tabela, o app
levaria `permission denied` mesmo com o RLS correto. As 6 tabelas já saem com o
grant.

### Pendências

- [x] Aplicar em produção — feito em 30/07/2026
- [ ] Regenerar `src/integrations/supabase/types.ts` (as telas usam cliente
      destipado enquanto isso; depois dá para trocar por acesso tipado)
- [ ] Conferir/remover a linha de teste de fumaça (ver abaixo)
- [ ] Interface do parceiro (hoje o CRM só está no painel admin)

### Conferência pós-aplicação (produção)

Rodado no editor SQL após aplicar:

| item | esperado | encontrado |
|---|---|---|
| tabelas com RLS | 6 | 6 |
| políticas | 9 | 9 |
| funções | 4 | 4 |
| gatilhos | 4 | 4 |

Teste de fumaça em produção: criado um quadro, movido um cartão de etapa, e o
gatilho gravou a atividade `mudanca_coluna` corretamente (1 registro).

**Ponto em aberto:** o quadro de teste chamado `ZZZ teste de fumaca`
(`escopo='admin'`, `modelo=true`) foi apagado com um DELETE confirmado no
editor, mas a interface do Lovable ficou instável e não deu para ler o retorno
final. Ele não aparece em nenhuma tela atual (a página admin filtra
`escopo='parceiro'`), então não atrapalha o uso. Para confirmar e limpar:

```sql
SELECT id, nome, escopo, modelo FROM public.crm_quadros WHERE nome LIKE 'ZZZ%';
DELETE FROM public.crm_quadros WHERE nome LIKE 'ZZZ%';
```

Observação sobre o `updated_at`: no teste ele saiu igual ao `created_at` porque
o editor roda tudo numa transação só e `now()` devolve o horário de início da
transação. Não é defeito — no teste local, com comandos em transações
separadas, o gatilho atualizou corretamente.

Observação sobre o editor do Lovable: ele acusa "operação destrutiva" quando o
SQL contém a palavra DELETE, mesmo que seja só o privilégio em
`GRANT SELECT, INSERT, UPDATE, DELETE`. É falso positivo.
