
## O que aconteceu

O cliente **conseguiu se cadastrar** (o usuário foi criado no backend), mas ao abrir o link do e-mail de confirmação caiu direto no host do backend (`...supabase.co`) recebendo `No API key found in request`. Isso significa que o link chegou **sem o token** (`?token=...&type=signup&redirect_to=...`) — só o host — ou o token já foi consumido/expirou.

## Correções

### 1. Garantir Site URL e Redirect URLs corretos no Auth
Configurar via ferramenta de auth do Cloud:
- **Site URL:** `https://fitmindclub.lovable.app`
- **Redirect URLs (allowlist):** adicionar
  - `https://fitmindclub.lovable.app/*`
  - `https://fitmindclub.lovable.app/login`
  - `https://id-preview--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app/*` (preview)

Sem isso, o `emailRedirectTo: ${window.location.origin}/login` pode ser rejeitado e o link volta apontando só para o host do backend.

### 2. Revisar o template de e-mail "Confirm signup"
Confirmar que o corpo do template usa:
```
<a href="{{ .ConfirmationURL }}">Confirmar minha conta</a>
```
E **não** apenas `{{ .SiteURL }}` ou texto solto com o link colado. Se o template atual estiver quebrado, restaurar para o padrão.

### 3. Melhorar a tela pós-cadastro (CheckEmailNotice)
- Já existe botão "Reenviar e-mail de confirmação" — deixar mais visível e adicionar aviso: *"Se o link do e-mail não abrir corretamente, copie e cole a URL inteira no navegador (WhatsApp/apps de mensagem às vezes cortam links longos)."*
- Trocar o `emailRedirectTo` do reenvio para bater exatamente com o do cadastro original.

### 4. Recuperar o cliente atual
- Pedir para o cliente clicar em **"Reenviar e-mail de confirmação"** na tela após o cadastro, OU
- Confirmar manualmente o e-mail dele pelo painel de Users do backend (ação de admin, uma vez).

## Fora do escopo
- Não mexer em regras de negócio, comissões, papéis, checkout.
- Não alterar o fluxo de cadastro em si — o cadastro está funcionando; o problema é só o link de confirmação.

## Preciso confirmar com você
1. O cliente recebeu o e-mail no Gmail/Outlook e clicou lá, ou o link foi repassado por WhatsApp antes? (isso muda o diagnóstico: se veio do WhatsApp, é só truncamento do link e a correção 3 resolve).
2. Posso ajustar Site URL / Redirect URLs do Auth agora (correção 1)?
