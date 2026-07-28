## Diagnóstico confirmado

- `https://fitmindclub.com.br` responde com HTTPS válido e status 200 quando testado daqui.
- `https://www.fitmindclub.com.br` redireciona corretamente para `https://fitmindclub.com.br`.
- O print mostra o Chrome tentando abrir `fitmindclub.com.br/diagnostico` como **Não seguro/HTTP**, com alerta de “não pode fazer uma conexão segura”. Isso acontece antes do React/app carregar, então não é um bug de tela, carteira ou service worker do app naquele momento.
- O domínio de e-mail do projeto ainda não está configurado para `fitmindclub.com.br`; isso pode continuar afetando confirmação de e-mail/redefinição de senha e links de autenticação.

## Plano de correção

1. **Forçar caminho seguro de recuperação no app**
   - Ajustar a rota `/diagnostico` para exibir instruções mais diretas: abrir sempre `https://fitmindclub.com.br/diagnostico?sw=off` e não usar link baseado no `origin` atual quando o usuário entrou via HTTP.
   - Adicionar botão/link explícito para a versão HTTPS oficial.

2. **Reforçar limpeza de cache/service worker sem loop**
   - Manter o kill-switch atual, mas revisar se existe alguma chamada antiga ainda tentando registrar `/sw.js`.
   - Remover qualquer resquício de registro automático de service worker de app-shell, preservando apenas workers de push/mensageria.

3. **Configurar domínio de e-mail do projeto**
   - Abrir o setup de e-mail para usar o domínio customizado do projeto.
   - Depois que o setup for concluído, ativar os templates/infra necessários para que confirmação de e-mail e redefinição de senha usem o domínio correto.

4. **Padronizar redirects de autenticação**
   - Garantir que confirmação de cadastro, reset de senha e Google login sempre usem URL pública HTTPS oficial quando estiverem fora de preview/local.
   - Evitar links HTTP ou origem insegura nos fluxos de e-mail.

5. **Publicar e validar**
   - Após implementar, será necessário publicar para os usuários afetados receberem o novo HTML/configuração.
   - Validar com `curl` e navegador que:
     - `http://fitmindclub.com.br/diagnostico` redireciona para HTTPS;
     - `https://fitmindclub.com.br/diagnostico?sw=off` carrega;
     - a página mostra o link oficial seguro;
     - os redirects de auth apontam para HTTPS.

## Ação fora do código

Se mesmo com HTTPS válido alguns aparelhos continuarem com `ERR_CONNECTION_CLOSED`, a causa provável é DNS/rede/antivírus/proxy do aparelho. A correção prática será orientar esses usuários a testar:

- abrir diretamente `https://fitmindclub.com.br/diagnostico?sw=off`;
- limpar DNS/cache do navegador;
- trocar DNS para 1.1.1.1 ou 8.8.8.8;
- testar `https://fitmindclub.lovable.app` para separar problema de domínio próprio vs. app.