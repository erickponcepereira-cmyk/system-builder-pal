# Corrigir produtos profissionais na loja pública anônima

## Diagnóstico confirmado

O link informado aponta para o produto **Experience Day 12/09** (`professional_products`). O produto existe, está `approved` e ativo.

A consulta anônima falha com `permission denied for table profiles`. A política atual de leitura de `professional_products` mistura, na mesma expressão, a regra pública com verificações de proprietário/admin que consultam `profiles`. Para visitantes anônimos, essas verificações internas bloqueiam a consulta inteira. A interface recebe erro e o converte incorretamente em “Produto não encontrado”.

## Implementação

1. **Separar as políticas de leitura por público**
   - Criar uma política exclusiva para `anon`, permitindo somente produtos profissionais aprovados e ativos.
   - Manter as regras de admin, proprietário e coach superior em uma política separada para usuários autenticados.
   - Não liberar `profiles`, dados pessoais ou campos adicionais ao público.

2. **Tornar a leitura pública mais robusta**
   - Fazer o permalink consultar uma função pública de catálogo por ID que una produtos FitMind, parceiros e profissionais e devolva apenas campos seguros de vitrine.
   - Evitar consultas diretas a tabelas com políticas complexas durante SSR/anônimo.
   - Diferenciar “produto realmente inexistente/inativo” de falha de consulta, para não mascarar erros de permissão como produto removido.

3. **Cobrir todos os formatos de acesso**
   - Validar `/produto/{id}?ref={coach}` em sessão anônima.
   - Validar o mesmo produto pela loja pública e pelo link `/r/{coach}?p={id}`.
   - Confirmar que produtos FitMind, de parceiro e de profissional continuam visíveis sem expor custos, comissões ou dados do proprietário.

4. **Teste de regressão no link reportado**
   - Repetir o teste anônimo com `https://fitmindclub.com.br/produto/f1f7b08d-d25b-4e39-8340-646676b3b311?ref=T93FNN`.
   - Confirmar título, imagem, preço e descrição do **Experience Day 12/09**.
   - Confirmar ausência de erros 401/403 e preservação do código de indicação `T93FNN`.

## Resultado esperado

Links de produtos profissionais passam a abrir corretamente em guia anônima, sem depender de sessão e sem ampliar o acesso público a perfis ou informações financeiras.