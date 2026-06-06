## Plano

1. **Corrigir o bug do leitor de QR**
   - Ajustar a função do backend que pré-visualiza cupons para retornar exatamente os tipos esperados pelo banco.
   - O erro atual vem do retorno da função `partner_preview_coupon`: alguns campos estão saindo como `varchar` enquanto a função promete `text`, causando `structure of query does not match function result type`.
   - Manter a leitura de dois formatos: QR da carteirinha do aluno e QR de cupom.

2. **Adicionar horário permitido de uso nos produtos gratuitos**
   - Criar campos opcionais no produto gratuito do parceiro para início e fim do horário permitido.
   - Exemplo: “Disponível das 08:00 às 14:00”.
   - Deixar vazio quando o benefício puder ser usado a qualquer horário.

3. **Atualizar cadastro/edição do parceiro**
   - No formulário de produto gratuito, adicionar os campos opcionais de horário permitido.
   - Mostrar esse horário em destaque na lista de produtos do parceiro.

4. **Mostrar o horário para aluno/coach**
   - Exibir o horário em destaque nos cards de benefícios gratuitos/descontos.
   - Exibir o horário também no modal/tela onde aparece o QR code do cupom, para o aluno saber quando pode usar.

5. **Validação no resgate pelo parceiro**
   - Na leitura/validação do cupom pelo parceiro, mostrar o horário permitido junto com os dados do cupom.
   - Bloquear a validação se o cupom for lido fora do horário configurado, retornando uma mensagem clara.

## Arquivos/áreas afetadas

- Backend: funções de cupom e tabela `partner_products`.
- Painel parceiro: cadastro/lista de produtos em `src/routes/partner.tsx`.
- Área do aluno: benefícios e QR do cupom em `student.freebies` e perfil do parceiro.
- Área coach/parceiro: cards de benefícios reutilizados em `CoachBenefitsTab`.
- Tipos do backend serão atualizados conforme a migração.