## Situação verificada agora

- O perfil `gibadelmondes@hotmail.com` existe (Gilberto Delmondes, papel `partner`) e já tem **1 unidade**: "Mutação Fit", status `approved`.
- **Bloqueio encontrado:** a tabela `partners` tem a restrição única `partners_profile_id_key` em `profile_id`. Ou seja, hoje **é impossível** o mesmo perfil ter 3 academias — a segunda inserção falha no banco. A Entrega 1 criou toda a camada de permissões e o seletor, mas o cadastro de unidades adicionais ainda não é possível.
- Não existe tela para criar uma segunda unidade: o cadastro de parceiro é 1 por perfil.

Resposta direta à sua pergunta: **não**, você não precisa criar 3 perfis (3 logins). O modelo escolhido é 1 login = várias unidades. Mas para isso funcionar faltam duas coisas: remover a restrição do banco e criar o botão "Nova unidade".

## O que vou implementar

### 1. Migration
- Remover `partners_profile_id_key` e criar índice **não único** em `partners(profile_id)`. A coluna continua existindo (nada é removido).
- Ajustar o que assume 1 parceiro por perfil no banco (auditar funções que usam `WHERE profile_id = ... LIMIT 1`, principalmente `current_partner_id`, já revisada na Entrega 1).
- Garantir que criar uma unidade nova gere automaticamente a linha `owner` em `partner_members`, a carteira da unidade e o `referral_code` da unidade (trigger).

### 2. Botão "Nova unidade" no painel do parceiro
- No seletor de unidades já existente no topo do `partner.tsx`, item final "+ Nova unidade".
- Modal com nome fantasia, documento, cidade/estado, endereço, WhatsApp, foto — os mesmos campos do cadastro atual.
- A unidade nasce com status `pending` e aparece na aba de liberação do admin, igual a qualquer parceiro.
- Só quem é `owner` de alguma unidade vê o botão.

### 3. Admin
- Na tela de liberação de parceiros, mostrar o dono (perfil) ao lado do nome da unidade, para você não confundir 3 linhas do mesmo dono.

## Passo a passo que você vai seguir depois (tutorial)

**A) Criar as outras 2 academias**
1. Entrar com `gibadelmondes@hotmail.com` → painel **Parceiro**.
2. No topo, abrir o seletor de unidade → **+ Nova unidade** → preencher "Academia 2" → salvar. Repetir para a terceira.
3. Entrar como admin → **Cloud/Admin → Parceiros → liberar** as duas novas (ou usar "Isentar/Liberar" como já faz hoje).
4. Voltar ao painel do Gilberto: o seletor no topo mostra as 3, e trocar de unidade troca produtos, carteira, gratuitos e pedidos daquela academia.

**B) Criar a recepção de uma academia**
1. A recepcionista cria uma conta normal no app (ou já tem uma) — basta ter e-mail cadastrado.
2. Gilberto seleciona a academia dela no topo → aba **Membros** → **Convidar por e-mail** → informa o e-mail dela → papel `staff`.
3. Nas caixinhas de permissão marca só o que ela pode: por exemplo *Ver visão geral* e *Usar leitor de QR*. Deixa produtos e carteira desmarcados.
4. Ela entra com o login dela: vê só aquela academia e só as 2 abas. O bloqueio é no banco, não só na tela — tentativa de editar produto pela API volta erro de permissão.

**C) Como fica a rede (MLM)**
- As 3 academias **não** são 3 cadastros abaixo dele na árvore. São 3 unidades ao lado, penduradas no mesmo perfil.
- A rede/upline continua sendo a do perfil do Gilberto: toda venda das 3 sobe pela mesma árvore, com o mesmo upline nível 1/2/3 dele.
- A carteira e os relatórios são **separados por unidade**, então você consegue ver quanto cada academia vendeu, mas a comissão de rede é consolidada no perfil dele.
- Se um dia você quiser que cada academia tenha upline própria (nós distintos na árvore), aí sim seriam 3 perfis — e o painel único deixa de existir. Não é o que está implementado.

## Detalhes técnicos

- Arquivos afetados: nova migration em `supabase/migrations/`, `src/routes/_authenticated/partner.tsx` (item "+ Nova unidade" no seletor), novo `src/components/partner/NovaUnidadeDialog.tsx`, e a tela de aprovação em admin.
- Toda policy nova sai com `TO authenticated` explícito; nenhuma consulta com `select("*")`.
- Validação com `npx vite build` (o typecheck não cobre `src/routes`).
