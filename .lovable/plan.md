# Links de redefinição de senha no Admin

Objetivo: o admin busca qualquer cliente pelo e-mail/nome e gera na hora um link de redefinição de senha, para copiar ou enviar direto por WhatsApp — sem depender do e-mail chegar.

## O que será feito

1. Nova aba no Admin: "Senhas / Acesso" (dentro da tela existente "Liberar E-mail", como segunda seção).
   - Campo de busca por e-mail ou nome, listando qualquer conta (hoje a tela só mostra contas com e-mail não confirmado).
   - Para cada conta: botão **Gerar link de redefinição**, **Copiar link**, **Enviar no WhatsApp** (mensagem pronta em português) e o já existente **Senha temporária**.
   - O link gerado aparece na tela com aviso de validade (1 hora) e uso único.

2. Geração do link no servidor (somente admin), usando a API administrativa do backend para criar um link de recuperação apontando para `/reset-password` no domínio oficial. O link já confirma o e-mail da conta se estiver pendente, então serve também para clientes que nunca conseguiram confirmar.

3. Botão "Reenviar e-mail de redefinição" no mesmo painel, para o caso de o envio voltar a funcionar.

## Sobre o e-mail não chegar

O app ainda usa os e-mails padrão de autenticação. Não verifiquei nesta etapa se há domínio de envio configurado; a primeira ação da implementação será checar o status do domínio de e-mail do projeto e reportar. Se não houver domínio verificado, os e-mails de redefinição podem não ser entregues de forma confiável — nesse caso indico configurar o domínio (fitmindclub.com.br) para envio, o que resolve a causa raiz. O painel de links manuais funciona independentemente disso.

## Detalhes técnicos

- `src/lib/admin-email-releases.functions.ts`: novas server functions `adminSearchAuthUsers` (busca ampla, não só não confirmados) e `adminGenerateRecoveryLink` (usa `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', redirectTo: 'https://fitmindclub.com.br/reset-password' })`), ambas com `assertAdminProfile`.
- `src/routes/_authenticated/admin.email-releases.tsx`: nova seção de busca + ações, reaproveitando o layout atual.
- Link nunca é logado nem persistido; fica só na tela até o admin recarregar.
- `/reset-password` já trata `access_token`/`code`; nenhuma mudança necessária lá.
