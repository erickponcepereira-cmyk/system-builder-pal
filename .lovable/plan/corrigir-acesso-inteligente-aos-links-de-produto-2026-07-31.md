# Corrigir acesso inteligente aos links de produto

## Objetivo
Fazer o link de cada produto abrir uma única vez no destino correto:

- usuário logado como aluno: loja interna, com o produto aberto;
- usuário deslogado: página pública do produto;
- sem exibir a loja pública antes do redirecionamento e sem ciclos de atualização.

## Implementação

1. **Bloquear o flash da página pública durante a verificação da sessão**
   - Substituir o redirecionamento tardio por um gate de resolução de sessão nas rotas públicas `/produto/$id` e `/loja`.
   - Enquanto a sessão é verificada, mostrar apenas um estado neutro de carregamento.
   - Se houver aluno autenticado, definir a área ativa como aluno e navegar uma única vez para `/student/store?produto={id}`.
   - Se não houver sessão/aluno, liberar normalmente a página pública.

2. **Usar a busca tipada da rota como fonte única do produto**
   - A rota `/student/store` entregará `produto` diretamente ao `StorePage`.
   - Remover a leitura paralela de `window.location.search` e o uso do produto pendente para esse acesso direto.
   - Não apagar `?produto=` enquanto o catálogo ainda está carregando.

3. **Abrir corretamente qualquer tipo de produto**
   - Após o catálogo carregar, procurar o ID primeiro nos produtos FitMind e, se não estiver lá, abrir a aba de Parceiros & Profissionais.
   - Passar o ID explicitamente ao componente dessa vitrine, em vez de depender de `localStorage` compartilhado.
   - Limpar o parâmetro apenas quando o usuário fechar o modal, preservando o permalink enquanto o produto estiver aberto.

4. **Eliminar navegações concorrentes**
   - Garantir que apenas uma camada controle o redirecionamento e apenas uma camada controle a abertura do modal.
   - Manter o armazenamento de “produto pendente” somente para fluxos que realmente atravessam cadastro/login/OAuth.

## Validação

- Testar `/produto/{id}` deslogado: permanece na página pública correta.
- Testar o mesmo link logado: mostra carregamento curto e entra direto na loja interna com o produto aberto.
- Repetir com produto FitMind, parceiro e profissional.
- Fechar o modal e reabrir o link, verificando que não há recarregamento, troca repetida de aba nem perda do ID.
- Conferir navegação em desktop e celular e ausência de erros no console.

## Detalhes técnicos

O problema atual é uma corrida entre três mecanismos: o `useEffect` da rota pública, o armazenamento de produto pendente e o efeito da loja que sincroniza a URL. A correção centraliza sessão, ID do produto e estado do modal, evitando que um efeito remova o parâmetro antes que outro consiga consumi-lo.