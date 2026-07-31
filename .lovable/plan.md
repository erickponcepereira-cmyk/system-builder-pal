# CRM no admin: liberar para parceiros e profissionais + correções

## O que encontrei (verificado no banco)

- **Nenhum CRM foi ativado até agora**: a tabela de quadros está vazia (0 linhas), mesmo com a tela existindo.
- **Causa provável**: a regra de criação de quadro no banco só permite criar um quadro de parceiro para quem tem a permissão `crm` **dentro daquele parceiro**. O administrador **não** está incluído nessa regra — então o botão "Ativar CRM" falha com "Não deu para ativar o CRM". Ler e editar quadros já contempla admin; só a criação ficou de fora.
- **Parceiros**: existem 37 cadastrados (32 aprovados, 4 pendentes, 1 bloqueado), nenhum sem nome. A consulta da tela não filtra status nem tem limite, e o admin enxerga todos pelas regras de acesso. Ou seja, a lista incompleta não tem causa confirmada ainda — pode ser falha de sessão/permissão no momento da leitura. A correção proposta elimina essa dependência lendo a lista pelo servidor, com contagem exibida na tela.
- **Profissionais**: o banco já aceita quadros com escopo `profissional` (dono = perfil da pessoa) e a regra de acesso já trata esse caso. Falta apenas a interface no admin — hoje a tela só lista parceiros. Existem 24 profissionais cadastrados.

## O que será feito

### 1. Admin pode ativar CRM (correção de banco)
Ajustar a regra de criação de quadros para permitir que administradores criem quadros em qualquer escopo (parceiro, profissional, coach, admin), mantendo a permissão atual dos donos.

### 2. Aba dupla na tela de CRM do admin
A tela passa a ter duas listas: **Parceiros** e **Profissionais**, cada uma com busca, contagem total e os mesmos botões de Ativar / Abrir quadro / Desativar / Reativar.
- Parceiros: dono do quadro = a unidade parceira (como hoje).
- Profissionais: dono do quadro = o perfil do profissional.
- Cartões de resumo passam a mostrar CRMs ativos e total de cadastros por tipo.

### 3. Lista confiável e completa
Criar funções de servidor de administrador para listar parceiros (todos os status, com o status visível na linha) e profissionais aprovados, e para ativar/desativar o CRM — em vez de consultar direto do navegador. Assim a lista não depende de regras de leitura da sessão e mostramos "37 parceiros" / "N profissionais" para conferência imediata.

### 4. Funil padrão garantido
Hoje, se a criação das etapas falhar, o quadro fica vazio e só um aviso aparece. A criação do quadro e das seis etapas padrão passa a ser feita em uma única operação no servidor, com mensagem de erro clara caso algo falhe.

### 5. Acesso do profissional ao próprio CRM
Garantir que o profissional com CRM ativo veja a aba de CRM no painel dele, do mesmo jeito que o parceiro. (Verificar o painel do profissional e adicionar a aba quando houver quadro ativo.)

## Detalhes técnicos

- Migração: substituir a política de INSERT de `crm_quadros` por uma versão com `OR public.is_admin(auth.uid())`.
- Novo `src/lib/admin-crm.functions.ts` com `listCrmTargets` (parceiros + profissionais + quadros existentes), `ativarCrm({ escopo, ownerId, nome })` (insere quadro + colunas padrão) e `alternarCrm({ quadroId })`, todos com `assertAdmin` e `supabaseAdmin` carregado dentro do handler.
- `src/routes/_authenticated/admin.crm.tsx`: passa a consumir essas funções via `useQuery`/`useServerFn`, com seletor de abas Parceiros/Profissionais e reuso do `CrmBoard` já existente.
- Profissionais listados de `coaches` com `is_professional = true` e `approved_at` não nulo, juntando `profiles` para nome/e-mail; `owner_id` do quadro = `profile_id`.
