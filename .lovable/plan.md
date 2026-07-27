## Diagnóstico confirmado

- O domínio `fitmindclub.com.br` e `www.fitmindclub.com.br` estão respondendo agora com HTTPS válido e certificado ativo.
- O problema em “alguns aparelhos” não parece ser erro de página/rota do app, porque quando o navegador mostra `ERR_CONNECTION_CLOSED` ele nem chega a carregar o React.
- O ponto mais provável é uma combinação de domínio/certificado recém-trocado + DNS/rota móvel/IPv6/proxy do provedor, agravado por redirects e links de autenticação usando sempre o domínio oficial.
- Também há um service worker ativo em produção; ele não deve causar `ERR_CONNECTION_CLOSED`, mas pode manter comportamento antigo em aparelhos que instalaram/abriram o app antes das correções.

## Plano de correção

1. **Criar uma página pública de diagnóstico**
   - Adicionar uma rota simples, por exemplo `/diagnostico`, sem login.
   - Ela mostra domínio atual, protocolo, status de service worker, versão publicada e um botão para limpar service worker/cache local do app.
   - Isso permite testar no aparelho problemático se o site carregou ou se a falha acontece antes do app.

2. **Adicionar um link de recuperação sem service worker**
   - Manter o kill-switch `?sw=off`, mas tornar isso acessível em uma rota amigável.
   - Se o aparelho conseguir abrir `https://fitmindclub.com.br/diagnostico?sw=off`, o app remove o service worker antigo e recarrega limpo.

3. **Tornar redirects de autenticação menos frágeis**
   - Revisar `getAuthRedirectUrl` para não forçar o domínio oficial quando o usuário já está em `www.fitmindclub.com.br` ou no domínio publicado alternativo.
   - Usar origem atual em todos os ambientes válidos do app, evitando que alguns aparelhos sejam redirecionados para uma variação de domínio que a rede deles está bloqueando.

4. **Reduzir loop/redirect desnecessário entre domínios**
   - Garantir que `www` e raiz continuem funcionando, mas que links internos e de auth não fiquem alternando domínio.
   - Evitar trocar o domínio durante fluxos sensíveis como redefinição de senha, confirmação de e-mail, convite e login Google.

5. **Publicar e orientar teste objetivo**
   - Depois da implementação, testar:
     - `https://fitmindclub.com.br/diagnostico?sw=off`
     - `https://www.fitmindclub.com.br/diagnostico?sw=off`
     - link de redefinição de senha
     - link de indicação `/r/CODIGO`
   - Se o aparelho ainda mostrar `ERR_CONNECTION_CLOSED` antes de qualquer página carregar, a causa restante é rede/DNS/operadora do aparelho, não código do app; nesse caso a solução é manter também o domínio publicado alternativo como fallback temporário para usuários afetados.