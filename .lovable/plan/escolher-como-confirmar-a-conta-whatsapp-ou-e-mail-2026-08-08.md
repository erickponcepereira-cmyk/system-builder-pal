# Escolher como confirmar a conta: WhatsApp ou e-mail

Hoje todo cadastro (aluno, coach, parceiro, profissional) termina chamando o cadastro padrão do backend, que dispara o e-mail de confirmação automaticamente e leva direto para a tela "Confirme seu e-mail". A tela de confirmação por WhatsApp já existe no projeto, mas não está ligada a nenhum fluxo — por isso não há como testá-la.

## O que muda

1. Novo passo no fim do cadastro: **"Como você quer confirmar sua conta?"**
   - Opção **WhatsApp** (recomendada): abre a tela existente com o botão "Abrir o WhatsApp e enviar". Assim que a mensagem chega, a conta é confirmada e a pessoa entra direto.
   - Opção **E-mail**: mantém exatamente o comportamento atual (link de confirmação + tela "Confirme seu e-mail" com reenvio).
2. O e-mail automático deixa de ser disparado quando a pessoa escolhe WhatsApp — hoje ele sai sempre, antes mesmo de a pessoa escolher.
3. A escolha aparece nos quatro cadastros: aluno, coach, parceiro e profissional.
4. Se o WhatsApp de plantão estiver indisponível, a tela avisa e oferece o caminho por e-mail, sem travar o cadastro.

## Detalhes técnicos

- Nova server function `criarContaSemEmail` (`src/lib/signup-channel.functions.ts`): cria o usuário com `supabaseAdmin.auth.admin.createUser({ email_confirm: false })`, sem envio de e-mail, e devolve o `user.id` para o restante do cadastro seguir igual.
- `src/components/auth/createAuthUser.ts` ganha um parâmetro `canal: "email" | "whatsapp"`. Com `email`, segue o `supabase.auth.signUp` atual; com `whatsapp`, usa a nova função.
- `iniciarVerificacaoWhatsapp` passa a aceitar `userId`; ao confirmar (`api.bot.confirmar` / `conferirVerificacaoWhatsapp`), o servidor marca `email_confirm: true` via admin e a tela faz `signInWithPassword` com as credenciais recém-criadas.
- Novo componente `EscolherCanalConfirmacao.tsx` (dois cartões: WhatsApp / E-mail), renderizado antes de `CheckEmailNotice` nos quatro arquivos de cadastro; a senha digitada fica em estado local só para o login automático após a confirmação.
- `CheckEmailNotice` ganha um link discreto "Prefiro confirmar pelo WhatsApp" para voltar à escolha.

## Fora do escopo

Não altero o login social (Google/Apple), que já vem com e-mail confirmado.
