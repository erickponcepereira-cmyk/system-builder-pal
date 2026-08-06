# Carrinho público e indicação confiável até a compra

## Objetivo

Fazer o fluxo público funcionar como marketplace: o visitante monta e edita o carrinho sem cadastro; ao finalizar, entra ou cria a conta; depois retorna diretamente ao checkout com o mesmo produto e com o coach do link corretamente vinculado.

## Diagnóstico confirmado

- Na página direta `/produto/{id}`, o botão **“No carrinho (N)”** continua ligado à ação de adicionar. Por isso cada toque aumenta a quantidade e essa página não oferece abertura, redução ou remoção do item.
- A loja pública `/loja` já possui um carrinho editável, mas a página direta do produto mantém uma implementação separada e incompleta.
- A indicação está dividida entre registros diferentes no navegador. Um código novo pode ser mostrado pela rota, enquanto uma indicação antiga de até 30 dias continua sendo usada no produto/cadastro.
- A rota `/r/{code}` também pode deixar o registro da sessão divergente do registro durável. Os formulários priorizam um deles, portanto caminhos diferentes podem vincular coaches diferentes.
- No banco, o **Aulão de Jump** da foto pertence à Estação Funcional/Fernando. O código de coach de Fernando é `EMPBB8AA2`; o de Nathan é `51TXF4`. Não há colisão entre códigos. O caso da foto é compatível com a indicação antiga do navegador vencendo o link atual.

## Implementação

### 1. Carrinho público único

- Extrair/reutilizar um único carrinho público para `/loja` e `/produto/{id}`, eliminando a lógica duplicada da página de produto.
- Na primeira ação, adicionar o produto uma vez; depois, o botão passa a **“Ir ao carrinho”** e abre o carrinho em vez de incrementar novamente.
- Exibir painel inferior no estilo marketplace com foto, nome, preço, quantidade, botões `−` e `+`, remover, esvaziar, total e ações **Finalizar compra** / **Já tenho conta**.
- Manter o carrinho anônimo no navegador e importar uma única vez para a loja logada, sempre recalculando preço e disponibilidade pelos dados reais antes do checkout.
- Garantir layout seguro em celular, incluindo o tamanho mostrado na foto, sem conteúdo ou botões fora da área clicável.

### 2. Uma única fonte de verdade para indicação

- Consolidar captura, leitura, enriquecimento e limpeza da indicação para que sessão, armazenamento durável e backup do Google nunca discordem.
- Ao abrir um link explícito válido (`/r/CÓDIGO`, `/r/CÓDIGO?to=loja`, `/r/CÓDIGO?p=...` ou `/produto/{id}?ref=CÓDIGO`), iniciar o fluxo atual com esse código e substituir somente uma atribuição antiga ainda não convertida. Depois de concluído o cadastro, limpar os dados temporários para não contaminar futuros links no mesmo aparelho.
- Usar o código como valor autoritativo e resolver novamente no backend no momento de criar o aluno; não confiar apenas em nome ou ID guardado no navegador.
- Manter travado no formulário o coach resolvido pelo código e mostrar o mesmo nome em produto, loja e cadastro.
- Preservar separadamente “quem indicou” e “para onde voltar”, evitando que uma atualização de destino altere o coach.

### 3. Destino após cadastro ou login

- Unificar a intenção de produto/carrinho para os fluxos de senha e Google, em navegador comum, guia anônima e PWA.
- Para link de produto: retornar à loja do aluno com o produto/carrinho restaurado e abrir diretamente o checkout quando a pessoa já iniciou a compra.
- Para link de loja: retornar à loja logada sem cair no seletor de painel.
- Evitar consumo antecipado da intenção no login; ela só será apagada depois que o destino final for aberto com sucesso.
- Manter o carrinho e a intenção durante confirmação de e-mail, login existente e conclusão de dados do Google.

### 4. Proteções e validação

- Adicionar testes para: Fernando → Aulão de Jump → cadastro por senha; Fernando → Google; usuário já logado; link de loja; carrinho com aumento/redução/remoção; e navegador com indicação antiga de Nathan recebendo link novo de Fernando.
- Testar também dois links consecutivos antes do cadastro para garantir que a interface, o payload e o aluno criado usem o mesmo código vigente.
- Validar em viewport móvel o produto da foto, abertura do carrinho, retorno ao checkout e nome do coach exibido em todas as etapas.

## Resultado esperado

```text
Link de Fernando para o Aulão
  → produto mostra “Convidado por Fernando”
  → adicionar uma vez
  → “Ir ao carrinho” abre o painel editável
  → finalizar pede cadastro/login
  → cadastro mantém Fernando travado
  → retorna ao checkout com o Aulão no carrinho
```

Nenhuma alteração de regra financeira ou comissão será feita; o trabalho fica restrito ao carrinho, à atribuição do coach e à continuidade do destino de compra.