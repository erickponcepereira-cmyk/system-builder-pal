# Correções: módulo Corrida, produto restrito do Adriano e validações

## O que eu confirmei agora no sistema

- **Módulo Corrida**: a configuração existe e está salva — "corrida" está desligada no padrão global e **ligada para a rede da Carol Heming** (carolheming25@gmail.com). A rede dela hoje tem 2 alunos diretos e nenhum coach downline. A tela de Admin também já existe (menu "Módulos por Rede", dentro do grupo de configurações). Ou seja: o dado está certo — falta descobrir por que a aba não aparece na tela do aluno e por que o item do menu não foi encontrado.
- **Produto do Adriano** ("Condomínio Chapada do Poente"): está aprovado, com restrição de rede ligada, 30 dias de carteirinha e 1 ticket configurados. **Porém a rede autorizada não é a do Adriano** — o coach autorizado gravado é **Adriana de Castro Rocha** (hagataklaus@gmail.com), provavelmente selecionada por engano na busca por nome parecido. Por isso o produto some para todo mundo, inclusive para os alunos do Adriano.
- **Carteirinha/tickets**: a regra no banco já dá prioridade ao valor manual do admin sobre a tabela automática por faixa de preço. Isso está escrito no código, mas **ainda não foi validado com uma compra real** — é o que você pediu.
- **Verificação por WhatsApp**: não existe **nenhum** registro de verificação no banco até agora, ou seja, o fluxo nunca chegou a ser concluído por ninguém. Precisa ser testado ponta a ponta.
- **Apple**: o provedor está habilitado no backend e o botão existe no login e no cadastro; falta o teste real de entrada.

## O que vou fazer

### 1. Módulo Corrida aparecendo de verdade
- Testar no navegador, logado como um aluno da rede da Carol, se a aba "Corrida" aparece no painel de Evolução, e capturar o erro exato caso não apareça (permissão da função de resolução, perfil sem coach vinculado, ou falha silenciosa na consulta).
- Corrigir a causa encontrada. Se o aluno não tiver coach vinculado, a resolução também vai considerar o coach do cadastro/indicação, não só o vínculo direto.
- Deixar o menu do admin fácil de achar: mover/duplicar "Módulos por Rede" para um lugar visível no painel Admin e incluir na busca termos como "corrida", "módulos", "evolução".

### 2. Produto restrito do Adriano
- Corrigir a rede autorizada do produto para o coach correto (Adriano).
- Melhorar o seletor de coaches no modal de revisão do admin: mostrar **nome + e-mail + número de coach** na busca e listar os coaches já autorizados com nome, evitando escolher a pessoa errada.
- Deixar claro na loja/admin quando um produto está restrito: o dono do produto e o admin continuam vendo o item com um selo "Restrito à rede X", em vez de o produto simplesmente desaparecer.

### 3. Validar carteirinha e tickets (não pode ser só cosmético)
- Fazer uma compra de teste do produto restrito com um aluno autorizado e conferir no banco:
  - se a validade da carteirinha do aluno realmente aumentou os dias configurados;
  - se a quantidade de tickets de desafio criada bate com o valor configurado;
  - se o gatilho de liberação dispara em todos os caminhos de pagamento (Pix, cartão e saldo da carteira).
- Corrigir o que não estiver aplicando o valor manual, e mostrar na loja o benefício real do produto (não o calculado por faixa de preço).

### 4. Validar login por telefone (WhatsApp) e Apple
- Testar o início e a confirmação da verificação por WhatsApp e corrigir o ponto onde ela trava (nenhuma verificação foi concluída até hoje).
- Testar a entrada com Apple no fluxo real de login/cadastro, conferindo se o retorno cria/vincula a conta e mantém o coach indicador.

## Detalhes técnicos

- `resolver_modulos(_profile_id)` resolve perfil → coach → cadeia de upline → tema → global. Vou instrumentar a chamada em `src/lib/use-modules.ts` para registrar erro (hoje falha em silêncio e o módulo simplesmente não aparece) e ampliar o fallback de coach do aluno.
- Menu: `src/components/admin/AdminShell.tsx` (item `/admin/modules`) + card na home do admin.
- Produto: correção de `allowed_coach_ids` via migração pontual; UI em `src/components/admin/ProductReviewModal.tsx` (busca de coach com e-mail/número) e selo de restrição em `src/components/store/PartnerProfessionalStore.tsx`.
- Perks: validar `grant_partner_product_perks` e seu gatilho em todos os caminhos de `partner_product_orders`, além dos badges de benefício na loja.
- Auth: `src/lib/verificacao-whatsapp.functions.ts` / tabela `bot_verificacoes`; Apple via `lovable.auth.signInWithOAuth("apple")` e `/auth/callback`.
