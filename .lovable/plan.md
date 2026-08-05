# Correções: carteirinha, co-produção, dados de clientes, modais e colaboradores

## 1. Carteirinha de 7 dias não liberava (confirmado no banco)

O "Aulão de Jump" (Estação Funcional, R$ 25) está com o marcador de perks desligado, e a rotina que concede os benefícios só olha esse marcador: quando ligado, dá fixo 30 dias + 1 ticket; quando desligado, **dá zero**. A regra por faixa de preço (7 dias até R$ 100, 15, 30, 60, 90 dias) só existe na tela — nunca é aplicada na hora do pagamento. Por isso as 8 compras pagas do produto não liberaram carteirinha nenhuma.

Correção:
- A concessão passa a usar sempre a regra por faixa de preço; o marcador de perks continua valendo como override (30 dias + 1 ticket) para produtos especiais.
- Reprocessar as compras já pagas de parceiro/profissional que não receberam carteirinha/tickets, usando a data original do pagamento.

## 2. Co-produção: o valor exibido dá a impressão de pagar mais do que o produto vale

Conferido: na carteira o cálculo está certo. O parceiro somou R$ 158,31 de vendas, R$ 79,19 foram repassados ao co-produtor e a carteira dele ficou com R$ 79,12 — não há pagamento duplicado.

O problema é de exibição: a lista "Últimas vendas dos seus produtos" mostra R$ 19,89 por venda (o líquido antes do repasse de co-produção), o que parece o valor total indo para o dono.

Correção:
- Na lista de vendas do parceiro e do profissional, mostrar o valor líquido **depois** do repasse de co-produção, com a linha "co-produção −R$ X" quando houver.
- Mostrar no cartão de resumo o total repassado a co-produtores no período.

## 3. Clientes aparecendo apenas como "Aluno", sem e-mail e telefone

Confirmado: os dados dos alunos existem no banco (nome, e-mail, telefone), mas o coach comum não tem permissão de leitura no cadastro deles — hoje só administradores e master coach conseguem. Por isso a tela cai no texto padrão "Aluno / Sem e-mail / Sem telefone", no Fernando e em qualquer coach não-master.

Correção:
- Nova regra de acesso permitindo que o coach leia os dados básicos dos alunos vinculados a ele (e o parceiro/profissional, dos seus colaboradores), sem abrir dados de terceiros.
- Vale para todos automaticamente, não é ajuste caso a caso.

## 4. Modais: botão de fechar sumindo e falta de margem de segurança

O modal de produto da loja é feito à mão e não usa a moldura padrão do sistema: o botão de fechar fica sobre a imagem e sai da área visível em alguns celulares.

Correção:
- Migrar o modal de produto (e os demais que ainda estão fora do padrão) para a moldura padrão: cabeçalho fixo com o "X" sempre visível e rodapé fixo com os botões.
- Aumentar a margem de segurança entre o conteúdo do modal e o topo/rodapé do celular (notch e barra de menu), evitando sobreposição do menu inferior.

## 5. Seletor de colaboradores no painel do parceiro

Hoje o painel do parceiro só tem o link/QR de convite e a lista de quem já entrou por ele. Falta o seletor que existe no painel do profissional (o que foi usado com a Delma).

Correção:
- Adicionar no parceiro o mesmo seletor: buscar alunos existentes, vincular como colaborador e remover, respeitando o limite de 7, com concessão dos benefícios igual à do profissional.

## Observação técnica

- `public.grant_partner_product_perks`: substituir o fixo 30/1 por `compute_partner_product_benefits(preço)`, mantendo `grants_subscription_perks` como override; script de backfill para pedidos pagos.
- Nova policy de SELECT em `profiles` para coach dono do aluno (via `current_user_coach_ids()`) e para parceiro/profissional dos colaboradores.
- `ProductDetailModal.tsx` e demais modais fora do padrão → `ModalShell`; ajuste do `modal-safe` para folga extra em relação à barra inferior.
- Painel do parceiro: reutilizar a lógica de `ProfessionalCollaboratorsPanel` (listar elegíveis, vincular/desvincular).
- Erros de compilação existentes que serão corrigidos junto: tipos em `src/lib/bot-engine.ts` e a permissão `"robo"` faltando no tipo `Permissao` em `partner.tsx`.
