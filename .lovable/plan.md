## Plano

1. **Confirmar o que já está funcionando no domínio**
   - O domínio `fitmindclub.com.br` e `www.fitmindclub.com.br` respondem corretamente em testes externos, então o problema no Redmi parece ser específico de compatibilidade/rede/cache do navegador ou de como o domínio principal está sendo servido naquele aparelho.

2. **Reduzir risco no domínio raiz**
   - Padronizar o app para usar sempre `https://www.fitmindclub.com.br` como domínio oficial de autenticação e links públicos.
   - Ajustar os redirects internos para não alternarem entre raiz e `www`, evitando falhas em celulares/navegadores mais sensíveis.

3. **Revisar os redirects de senha e confirmação de e-mail**
   - Garantir que redefinição de senha e confirmação de e-mail usem o mesmo domínio oficial.
   - Manter `/reset-password` público e impedir que o app redirecione para portal/login antes de concluir o reset.
   - Exibir erro claro em português quando o link estiver expirado, inválido ou já usado.

4. **Adicionar fallback visível para usuários bloqueados no domínio raiz**
   - Se alguém abrir `fitmindclub.com.br`, redirecionar de forma segura para `www.fitmindclub.com.br` dentro do app/publicação.
   - Isso não resolve DNS local do aparelho se a conexão for encerrada antes de carregar HTML, mas elimina inconsistência do lado do app e passa a divulgar apenas um domínio canônico.

5. **Verificar loja pública após o ajuste**
   - Conferir que `/loja`, categorias, produtos de parceiro e produtos de profissional continuam carregando após a padronização do domínio.

## Observação importante

Como o teste externo conseguiu carregar `fitmindclub.com.br`, mas o Redmi mostra `ERR_CONNECTION_CLOSED` antes de abrir a página, pode haver interferência local no aparelho/rede/operadora/DNS. Mesmo assim, vou blindar o app usando `www.fitmindclub.com.br` como domínio canônico para auth e navegação, que é a correção mais segura do lado do sistema.