# Aumentar vagas de um produto esgotado

## Resposta curta

Funciona. Hoje o "esgotado" não é um estado gravado no produto: o sistema conta em tempo real quantas vagas foram consumidas (pedidos pagos + pendentes dos últimos minutos) e compara com o número de vagas. Se você editar o Aulão do Léo de 25 para 27, ele volta a vender na hora, sem precisar de nova aprovação do admin e sem mexer em nada das vendas já feitas.

Verificado no banco:
- as vagas restantes são calculadas na hora (não existe campo "esgotado" travado);
- a venda só é bloqueada quando as vagas consumidas atingem o número atual — subir o número libera imediatamente;
- o parceiro tem permissão de editar o produto mesmo já aprovado, e nenhum gatilho devolve o produto para "aguardando aprovação" ao salvar.

## O que ainda pode confundir (e será corrigido)

1. Ao salvar, a mensagem sempre diz "Salvo. Aguardando aprovação do admin", mesmo quando o produto já está aprovado e continua vendendo normalmente. Vai passar a dizer "Alterações salvas" para produtos já aprovados.
2. No campo de estoque não dá para saber quantas vagas já foram usadas. Vai passar a mostrar, ao lado do campo, "X vendidas / Y restantes" do produto que está sendo editado.
3. Nada impede hoje colocar um número menor do que o já vendido (ex.: baixar para 10 com 16 pagas). Vai aparecer um aviso claro antes de salvar, informando que o produto ficará esgotado, exigindo confirmação.
4. A loja carrega as vagas restantes uma vez; depois de aumentar as vagas, quem já estava com a tela aberta pode continuar vendo "esgotado" até recarregar. A consulta de estoque passa a ser revalidada ao reabrir o produto/tela.

## Detalhes técnicos

- Confirmado: `partner_product_used_slots` + `partner_products_stock_status` calculam `remaining = GREATEST(0, stock - used)` dinamicamente; `create_partner_company_order` bloqueia só quando `used >= stock` no momento da compra (com `FOR UPDATE` na linha do produto). Nenhum trigger em `partner_products` altera `status`/`is_active_by_partner` por esgotamento.
- Ajustes no editor em `src/routes/_authenticated/partner.tsx`: buscar `partner_products_stock_status` para o produto em edição e exibir usadas/restantes junto ao campo "Estoque (opcional)"; confirmação quando `stock < used`; toast condicional ao `status` atual.
- `src/components/store/PartnerProfessionalStore.tsx`: invalidar/refazer a chamada de `partner_products_stock_status` ao abrir o detalhe do produto, para não exibir esgotado desatualizado.

## Fora do escopo

- Nenhuma mudança em preços, comissões, pedidos existentes ou regra de reserva temporária de vaga.
