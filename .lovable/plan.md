# Por que a Adriana caiu no coach errado — e como fechar isso de vez

## O que aconteceu (verificado no banco)

- Conta criada em 31/08 16:23:27 **pela Apple** (login com Apple, não e-mail/senha). A Apple não devolve nome, por isso o perfil dela ficou com o nome igual ao e-mail.
- Cadastro de aluna criado às 16:26:46 com **coach Nathan Utuari**, já como vínculo confirmado (sem pendência). O código do link, `6JD45Y`, é do **Wallace Hernan**.
- Em nenhum registro dela existe rastro do link: sem indicação de aluno, sem parceiro, sem lead com o código `6JD45Y` (a tabela de leads não tem nenhum registro com esse código). Ou seja, a indicação **nunca chegou ao servidor**.
- Pedido: Ticket Desafio Tradicional, R$ 100,00, PIX, pago, às 16:28.

### Causa

A indicação do link (`?ref=6JD45Y`) hoje só existe **no armazenamento do navegador** da pessoa. Ela some quando o cadastro é concluído em outro contexto de navegador — que é exatamente o caso do login com Apple aberto a partir de um link do WhatsApp: a página do produto abre no navegador interno do app, e o login com Apple continua em outro contexto (Safari / sheet do sistema), onde aquele armazenamento não existe.

Sem a indicação, a tela "Completar cadastro" não mostra o coach travado: mostra o **seletor livre de coach**. Ela escolheu o Nathan na lista. O sistema aceitou porque, do ponto de vista dele, era uma escolha legítima.

Nada foi "trocado" pelo sistema: a indicação se perdeu no meio do caminho e a escolha manual assumiu o lugar.

## Correção

### 1. A indicação viaja na URL, não só no navegador
- Antes de sair para Apple/Google, o código de indicação é anexado ao endereço de retorno (`/auth/callback?ref=CODE`).
- Ao voltar, o callback regrava a indicação a partir da URL antes de mandar para "Completar cadastro". Assim ela sobrevive a troca de navegador, WebView e app.

### 2. Registro do clique no servidor (fim do "sumiu")
- Nova tabela de **toques de indicação**: código, coach resolvido, produto, página de origem, data. Gravada quando alguém abre `/r/{code}`, `/produto/{id}?ref=` ou a loja com `?ref=`.
- No momento em que a conta é criada, o toque mais recente é ligado ao novo perfil (por e-mail/telefone/janela de tempo) e vira **prova de origem** — mesmo que o navegador tenha perdido tudo.

### 3. Coach travado quando existe indicação
- Havendo indicação (do navegador OU do toque registrado no servidor), a tela de completar cadastro mostra o coach **preenchido e bloqueado**, com o aviso de que o vínculo veio do convite.
- Se a indicação existir só no servidor e a pessoa tiver escolhido outro coach, o cadastro é gravado com o coach do convite e a divergência fica registrada para o admin.

### 4. Admin → Rastrear aluno: mapa completo
A tela existente ganha um bloco "Origem e jornada" com:
- link/campanha usada, código de indicação e coach dono do código;
- página de entrada (produto/loja/cadastro) e produto do link;
- como a conta foi criada (Apple, Google, e-mail/senha, WhatsApp);
- coach efetivamente gravado e **alerta em vermelho quando difere do coach do link**;
- o que comprou (pedidos, valores, forma de pagamento, status);
- anuidade/adesão: paga ou não, data e valor;
- mensalidade: situação atual, próximo vencimento, forma de pagamento e histórico — para os perfis de coach, parceiro e profissional;
- quais cadastros a pessoa tem (aluno / coach / parceiro / profissional) e a data de cada um.

### 5. Correção do caso da Adriana
Trocar o coach responsável dela de Nathan para **Wallace Hernan** e reprocessar as comissões do pedido de R$ 100,00 para a linha correta. (Confirme antes: quer que eu já refaça a comissão desse pedido, ou só o vínculo?)

## Detalhes técnicos

- `AppleSignInButton` / `GoogleSignInButton`: `getAuthRedirectUrl("/auth/callback")` passa a incluir `?ref=` quando há atribuição; `auth.callback.tsx` chama `gravarAtribuicaoResolvida` a partir do parâmetro antes de rotear.
- Migração: tabela `referral_touches` (code, coach_id, partner_id, product_id, landing_path, user_agent, created_at, claimed_profile_id) com GRANTs, RLS (insert anônimo restrito via RPC `registrar_toque_indicacao`, leitura só admin) e RPC `vincular_toque_ao_perfil`.
- `complete-signup.tsx` e `PendingCoachGate`: consultam a atribuição local e, na falta, uma função de servidor que devolve o último toque não reclamado; coach travado quando houver.
- `completeGoogleStudentSignup`: no servidor, se existir toque válido, ele prevalece sobre o `coachId` enviado pela tela.
- `admin-student-trace.functions.ts`: acrescenta `origin.link`, `signupProvider`, `purchases[]`, `annualFee`, `subscription` e `profiles[]`; a rota `admin.student-trace.tsx` renderiza os novos blocos.
