## Problema (verificado no banco)

- Leandro (profissional aprovado, `is_professional = true`) está na rede **Nathan → Jorge → Leandro**. A Estação Funcional (Fernando) está em outra ramificação.
- A função que monta a lista de coprodutores (`listCoproducerCandidates`) filtra os candidatos apenas pela rede MLM do usuário logado (ele + 1 upline + 3 níveis de downline). Por isso o Leandro não aparece: ele está fora dessa janela.
- O campo "código" hoje **não busca nada**: ele só é validado no momento de enviar o convite. Se o código estiver errado, o usuário só descobre no erro final. O código do Leandro existe (`entity_share_codes`), mas não há nenhuma tela de conferência antes.
- Bônus encontrado: a política de escrita de `entity_share_codes` compara `profile_id = auth.uid()` (deveria ser o id do perfil do usuário), então o fallback de criação de código quebra para quem ainda não tem código gerado.

## O que vou fazer

**1. Busca por e-mail/nome (principal)**
- Nova server function `searchCoproducerCandidates({ query })`: busca por e-mail exato/parcial ou nome, em profissionais aprovados (`coaches.is_professional`) e parceiros aprovados, **sem filtro de rede**.
- Retorna: nome, tipo (profissional/parceiro), e-mail mascarado (ex.: `lea***@hotmail.com`) para confirmação visual, e o id necessário para o convite. Nenhum dado sensível extra é exposto.
- Mínimo de 3 caracteres para buscar, limite de 20 resultados.

**2. Código com verificação imediata**
- Nova server function `resolveCoproducerCode({ code })` que resolve o código e devolve nome + tipo na hora.
- No modal, ao digitar o código aparece um cartão "Encontrado: Leandro da Silva Amorim — Profissional" antes de confirmar; se não existir, mensagem clara "Código não encontrado".

**3. Modal de convite reformulado**
- Um único campo de busca: aceita **e-mail, nome ou código** — o sistema decide sozinho (se parecer código, resolve por código; senão busca por e-mail/nome).
- Lista de sugestões da rede continua aparecendo como atalho, mas deixa de ser a única forma.
- Após escolher, segue o fluxo atual (percentual/valor fixo, custo, base do split).

**4. Correção do código próprio**
- Ajustar a política de `entity_share_codes` para usar o perfil correto do usuário, garantindo que todo parceiro/profissional consiga ver e gerar o próprio código para compartilhar.

## Detalhes técnicos

- `src/lib/collab.functions.ts`: adicionar `searchCoproducerCandidates` e `resolveCoproducerCode`; manter `listCoproducerCandidates` (atalho da rede) sem alteração de assinatura.
- Busca feita no servidor via cliente admin **após** validar que o chamador é dono/parceiro/profissional legítimo, retornando somente campos públicos + e-mail mascarado.
- `src/components/shared/CoproductionEditor.tsx`: substituir o seletor atual por campo de busca unificado com debounce e cartão de confirmação.
- Migração pequena para corrigir a policy de `entity_share_codes`.
