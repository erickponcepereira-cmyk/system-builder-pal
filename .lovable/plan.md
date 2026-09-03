# Correção permanente dos produtos da Major na loja

## Diagnóstico confirmado

O produto **“Desenvolvimento de Sistema Gago”**, da **Major Hub**, está:

- aprovado;
- pronto para venda;
- sem restrição de rede;
- vinculado à seção **Marketing** e categoria **Agência**, ambas ativas;
- não excluído.

Porém, `is_active_by_partner` está `false` desde **03/09/2026 00:18 UTC (02/09 às 21:18 em Cuiabá)**. A loja exige esse campo como `true` antes de montar o catálogo. Portanto, o produto não chega à busca — pesquisar o nome exato não poderia encontrá-lo.

A Major possui também o benefício gratuito **“Diagnóstico comercial”**, que permanece ativo. O painel administrativo atual não acusa o problema porque o relatório de “produtos que não aparecem” verifica aprovação e classificação, mas ignora os campos de visibilidade do vendedor e de prontidão para venda.

Não há auditoria da alteração desse campo, então hoje não é possível atribuir com segurança se a ocultação veio de um clique, edição ou outra rotina. Isso também será corrigido.

## Correção urgente

1. Reativar o produto pago da Major e conferir todos os produtos desse parceiro contra os mesmos critérios reais usados pela vitrine.
2. Validar que “Desenvolvimento de Sistema Gago” aparece:
   - em “Todas as cidades”;
   - em Cuiabá;
   - na seção Marketing;
   - na busca por nome exato, “Major Hub”, “Desenvolvimento” e “Gago”.
3. Confirmar que preço, vendedor e configuração financeira não foram alterados.

## Solução permanente

### Uma única regra de publicabilidade

Criar no banco uma função canônica de diagnóstico que avalie cada produto com os mesmos critérios da loja: aprovação, ativação pelo vendedor, prontidão, exclusão, seção/categoria, parceiro/profissional, restrição de rede e ocultações. A loja e o admin deixam de manter listas diferentes de motivos.

### Diagnóstico administrativo completo

Atualizar **Admin → Loja → Produtos que não aparecem** para incluir:

- “Oculto pelo parceiro/profissional”;
- “Não está pronto para venda”;
- “Parceiro/profissional indisponível”;
- “Restrito a uma rede”;
- seção ou categoria desativada;
- exclusão/arquivamento e demais causas reais.

Cada item mostrará o campo responsável e, quando for seguro, uma ação explícita de **Reativar na loja**. O relatório também terá busca por produto e vendedor, permitindo localizar imediatamente todos os itens da Major.

### Evitar ocultação acidental e mensagens falsas

No painel do parceiro/profissional:

- substituir o link discreto “Ocultar/Mostrar” por um controle de visibilidade com estado inequívoco;
- pedir confirmação antes de retirar um produto aprovado da loja;
- mostrar selo “Visível na loja” ou “Oculto da loja” em cada produto;
- após salvar uma edição, informar o estado real — hoje a mensagem diz que o produto “continua ativo” mesmo quando ele está oculto.

### Auditoria e prevenção de regressão

- Registrar toda mudança de visibilidade com produto, valor anterior/novo, usuário e data.
- Garantir que aprovação, edição financeira e edição de conteúdo não alterem `is_active_by_partner`/`is_active_by_professional` incidentalmente.
- Exibir aviso imediato ao responsável quando uma edição deixar um produto aprovado fora da vitrine.
- Adicionar testes para os critérios de entrada no catálogo e para busca por nome do produto e vendedor.

## Detalhes técnicos

- Migration versionada para reativar o produto da Major, criar a auditoria de visibilidade e ampliar `store_admin_shelf_report()`.
- `src/components/admin/StoreShelfDiagnostics.tsx`: novos motivos, busca, estado e ação de reativação.
- `src/routes/_authenticated/partner.tsx` e fluxo equivalente do profissional: controle seguro de visibilidade e mensagem fiel ao estado.
- `src/lib/unified-store.ts`: preservar a filtragem de segurança, mas consumir/espelhar o diagnóstico canônico e manter erro visível quando uma fonte estiver incompleta.
- Atualizar `docs/contexto/fitmind-loja-marketplace.md` com a causa e a regra definitiva.

## Verificação

- Consultar novamente todos os produtos da Major e comprovar que todo item esperado satisfaz os critérios da vitrine.
- Testar busca e navegação com conta de aluno e coach, sem liberar produto restrito para público indevido.
- Testar ocultar, cancelar, confirmar, reativar e editar um produto sem mudar sua visibilidade.
- Executar `node node_modules/typescript/bin/tsc --noEmit` e garantir nenhuma regressão fora da linha de base do projeto.
