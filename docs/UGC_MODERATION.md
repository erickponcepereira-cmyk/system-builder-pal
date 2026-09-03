# Moderação de conteúdo da comunidade

Este runbook cobre o sistema de conteúdo gerado por usuário (UGC) do FitMind Club para homologação e publicação na Google Play. Nenhuma etapa deste documento autoriza aplicar migrations diretamente em produção.

## Escopo protegido

- Mensagens e imagens dos grupos de desafio.
- Posts da timeline de parceiros.
- Avaliações de produtos feitas por compradores e respostas de vendedores.
- Perfis públicos de participantes e profissionais.
- Parceiros e seus itens de catálogo.
- Grupos externos do WhatsApp publicados por parceiros/profissionais.

O aplicativo exige o aceite da versão vigente das Diretrizes da Comunidade antes de publicar. Denúncia e bloqueio ficam disponíveis na própria superfície do conteúdo. O backend deriva a evidência do banco; o cliente nunca envia uma captura arbitrária como prova.

## Componentes

- Migration principal: `20260903000500_ugc_moderation.sql`.
- Versão da política no cliente: `src/lib/ugc.constants.ts`.
- Fluxos compartilhados: `src/lib/ugc.ts` e `src/components/ugc/`.
- Diretrizes públicas: `/diretrizes-da-comunidade`.
- Central do aluno: `/student/safety`.
- Fila administrativa: `/admin/moderation`.
- A tela editorial `/admin/avaliacoes` apenas lista e responde; ocultar, republicar e analisar recursos acontece exclusivamente na fila unificada para preservar a trilha de auditoria.
- Processador seguro de mídia: `src/lib/ugc-media-jobs.server.ts` e `src/lib/ugc-moderation.functions.ts`.
- Processador de exclusão dependente: `20260903000600_account_deletion_processor.sql`.

## Modelo e garantias

| Recurso | Garantia principal |
|---|---|
| `ugc_policy_acceptances` | Registra usuário, versão e horário do aceite. |
| `ugc_blocks` | Um alvo por linha; bloqueios de perfil são bilaterais no chat. |
| `ugc_reports` | Evidência capturada no servidor, limite diário e denúncia aberta idempotente. |
| `ugc_moderation_actions` | Trilha imutável; revogação é registrada em vez de apagar a ação. |
| `ugc_appeals` | Um recurso por ação, em até 90 dias, analisado por outro moderador. |
| `ugc_media_jobs` | Quarentena/restauração/expurgo via Storage API, com retry e sem DML do cliente. |
| `product_reviews` | Compra paga e produto são validados no banco; avaliação e resposta usam RPCs estreitas e autoria imutável. |

Evidências e notas internas não possuem `SELECT` direto para usuários. A fila administrativa usa `admin_list_ugc_reports`, que exige administrador master ou `admin_permissions.reports = true`. Ações e recursos usam a mesma permissão no banco; esconder o menu no React não é considerado controle de acesso.

Mensagens só podem ser inseridas pelo próprio remetente, no grupo ativo em que ele não esteja banido/silenciado e conforme `send_permission`. A única atualização comum permitida é a exclusão lógica da própria mensagem. Posts registram o autor real no banco e protegem campos de autoria/moderação contra alteração.

Avaliações não aceitam DML direto de `authenticated`. O RPC deriva o perfil, exige aceite vigente, valida pedido pago e confirma que origem/produto pertencem à compra. Na edição, somente nota e comentário podem mudar. Respostas registram o perfil do vendedor e só podem ser gravadas por quem administra o parceiro/produto profissional ou pela operação autorizada da FitMind. Avaliação e resposta são alvos de denúncia separados para que uma resposta abusiva nunca seja atribuída ao comprador.

Grupos do WhatsApp não aceitam DML direto de `authenticated`. O servidor valida proprietário/equipe, aceite vigente, tamanho e destino. Só são aceitos HTTPS e os hosts exatos `chat.whatsapp.com`, `wa.me` e `api.whatsapp.com`, ou telefone com 10 a 15 dígitos.

## Mídia denunciada

`group-media` já é privado e a interface gera URLs assinadas somente para mensagens visíveis. Uma URL assinada emitida antes da moderação pode durar até uma hora.

Posts de parceiro usam o bucket público `store-images`. Ao aplicar `hide_content`:

1. o post é ocultado imediatamente no banco;
2. um job de quarentena é criado;
3. a função de servidor valida origem, bucket, parceiro e prefixo do objeto;
4. o arquivo é copiado para o bucket privado `ugc-evidence`;
5. o original público é removido pela API oficial do Storage.

Em recurso aceito, a mídia é restaurada antes de o post voltar a `visible`. O botão **Atualizar e processar mídia** tenta novamente jobs pendentes/falhos. Não apagar linhas diretamente de `storage.objects`, pois isso pode deixar o arquivo físico órfão.

O worker usa lease de dez minutos para recuperar jobs interrompidos e encerra em `dead` após dez tentativas. Caminhos são decodificados repetidamente e validados contra o bucket, parceiro/grupo, prefixo e nome de arquivo esperados. Uma restauração só torna o post visível pela RPC service-role serializada; uma ocultação posterior sempre vence. Se outro post referencia o mesmo objeto, a quarentena preserva o original compartilhado.

## Ordem obrigatória de homologação

1. Criar backup e testar restauração em staging.
2. Sincronizar a branch com a `main` e confirmar que não surgiu migration posterior a `20260902182324_818d996d-82b3-44ed-9095-fbeada6b51e1.sql`. Se surgir uma migration da `main` com nome igual ou posterior ao primeiro arquivo deste lote, renumerar o lote inteiro antes da homologação.
3. Aplicar, nesta ordem:
   - `20260903000100_account_deletion_requests.sql`;
   - `20260903000200_disable_public_test_accounts.sql`;
   - `20260903000300_push_notification_audit.sql`;
   - `20260903000400_secure_public_payment_links.sql`;
   - `20260903000500_ugc_moderation.sql`;
   - `20260903000600_account_deletion_processor.sql`;
   - `20260903000700_secure_return_requests.sql`.
4. Publicar o backend da mesma revisão, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor.
5. Regenerar `src/integrations/supabase/types.ts` a partir do Supabase de staging depois de todas as migrations.
6. Rodar o checklist abaixo em staging com contas separadas de aluno, profissional, parceiro, moderador A e moderador B.
7. Consultar logs de Postgres, backend e Storage e resolver todo job `failed`.
8. Só então repetir a janela controlada em produção.

A migration altera RLS, ACL, gatilhos e funções existentes. Não fazer rollback parcial. Em falha, restaurar o backup de staging ou preparar uma migration compensatória revisada.

## Retenção e operação

- Recurso: até 90 dias após a ação.
- Evidência bruta sugerida: 180 dias depois da resolução.
- Auditoria mínima (alvo, resultado, horários e ação) pode permanecer sem conteúdo bruto.
- Na exclusão de conta, avaliações do titular são removidas, respostas dele são limpas e snapshots associados perdem texto, nota e identificadores pessoais imediatamente; permanece apenas contexto não pessoal da decisão.
- Executar periodicamente `ugc_purge_expired_report_evidence(180)` com `service_role`.
- Depois do purge, abrir a fila administrativa e usar **Atualizar e processar mídia**, ou processar os jobs com o mesmo backend autenticado.
- Nunca registrar `evidence_snapshot`, relato livre, URL assinada ou chave de serviço em logs.
- Alertar quando houver job `failed`/`dead`, lease recuperada, fila com atraso acima de 15 minutos ou denúncia aberta acima do SLA definido pelo negócio. Job `dead` exige investigação e não deve ser reiniciado às cegas.

## Matriz de testes de staging

### Aceite e publicação

1. Usuário sem aceite não envia texto no grupo.
2. Usuário sem aceite não envia imagem no grupo.
3. Parceiro sem aceite não publica post.
4. Profissional sem aceite não publica/edita o perfil público.
5. Parceiro/profissional sem aceite não salva grupo do WhatsApp.
6. Aceite da versão `1.0.0` libera a publicação e grava horário/perfil corretos.
7. Versão antiga ou inventada é rejeitada pelo RPC.
8. Mudança futura da versão volta a exigir aceite sem apagar o histórico anterior.

### Chat e arquivos

9. Remetente não consegue declarar outro `sender_profile_id`.
10. Membro não consegue mover mensagem para outro grupo por `UPDATE`.
11. Só a exclusão lógica da própria mensagem é aceita; conteúdo e mídia são limpos.
12. Banido não lê nem envia; silenciado temporário volta a enviar após o prazo.
13. `send_permission` funciona para membro, coach, gerente e admin.
14. Resposta para mensagem de outro grupo é rejeitada.
15. Caminho absoluto, URL externa, `..` ou prefixo de outro usuário é rejeitado em `group-media`.
16. Mensagem oculta não recebe nova URL assinada.

### WhatsApp

17. `https://chat.whatsapp.com/...`, `https://wa.me/...` e `https://api.whatsapp.com/...` são normalizados.
18. HTTP, credenciais, porta, subdomínio, sufixo enganoso, ponto final e caractere de controle são rejeitados.
19. Telefone fora de 10–15 dígitos é rejeitado.
20. Chamada PostgREST direta de INSERT/UPDATE/DELETE por `authenticated` é negada.
21. Conta sem vínculo com o parceiro/profissional é negada pela função de servidor.

### Denúncia e bloqueio

22. Denunciar mensagem, post, perfil, parceiro e grupo WhatsApp cria evidência correta no servidor.
23. Conteúdo próprio, oculto, apagado, inativo ou não visível não pode ser denunciado por UUID.
24. Segundo clique simultâneo retorna a denúncia aberta existente, sem duplicar.
25. A 21ª denúncia em 24 horas é recusada.
26. Denunciante vê status/decisão, mas não `evidence_snapshot`, notas internas ou metadata.
27. Bloquear perfil remove mensagens dos dois lados do chat.
28. Bloquear parceiro remove perfil, timeline, RPCs em lote e `partner_products` para o bloqueador.
29. Bloquear profissional remove perfil e produtos profissionais para o bloqueador.
30. Bloquear grupo WhatsApp o remove da rede; desbloquear o restaura se ainda estiver ativo.

### Moderação, mídia e recurso

31. Admin sem permissão `reports` não lista evidências nem decide denúncia/recurso.
32. Moderador aplica advertência, ocultação, mute, ban, suspensão, bloqueio de parceiro e desativação de WhatsApp.
33. Ocultação de post cria job, move arquivo para `ugc-evidence` e remove a URL pública original.
34. URL externa de post é ocultada no app sem tentar remover arquivo fora do Supabase.
35. Falha entre cópia e atualização é retomada sem duplicar/perder evidência.
36. Moderador que criou a ação não consegue julgar o recurso; outro moderador consegue.
37. Recurso aceito restaura mídia antes de tornar o post visível.
38. Recurso de uma ação antiga não desfaz ban/mute/ocultação mais recente ainda ativa.
39. Recurso após 90 dias é recusado e a interface informa o prazo encerrado.
40. Purge não toca denúncia aberta nem recurso pendente; após 180 dias limpa evidência fechada e agenda remoção da mídia privada.

### Privacidade, exclusão e regressão

41. `anon` não lê e-mail, telefone, nascimento, endereço, permissões administrativas ou CPF de `profiles`.
42. Exclusão da conta remove grupos WhatsApp, aceites, bloqueios, recursos, avaliações do autor e arquivos de evidência do titular; respostas feitas pelo vendedor são limpas sem apagar a avaliação do comprador.
43. Denúncias/auditoria preservadas ficam sem IDs pessoais, perfil público, convite, telefone, nota, comentário ou resposta do titular e registram que o conteúdo foi redigido por exclusão de conta.
44. Manifesto inclui `store-images/partners/<id>/posts`, `group-media` e `ugc-evidence`.
45. Catálogo, chat, timeline, perfis e WhatsApp continuam funcionando para usuários não bloqueados.
46. Navegação Android abre Diretrizes, Central de Segurança e Moderação sem tela em branco.
47. Typecheck, testes, build web/mobile e teste em aparelho real terminam sem erro.

### Avaliações e respostas de vendedores

48. Sem aceite vigente, criar/editar avaliação e criar/editar resposta de vendedor são recusados no banco.
49. `authenticated` não consegue fazer `SELECT`, `INSERT`, `UPDATE` ou `DELETE` direto em `product_reviews`; somente as RPCs concedidas funcionam.
50. Pedido alheio, pendente, cancelado, estornado ou inexistente não cria avaliação.
51. `store_order` em `paid`, `preparing`, `shipped` ou `delivered` continua elegível; a evolução logística não faz a compra deixar de estar paga.
52. `transaction`, `store_order` e `partner_product_order` só aceitam a origem e o produto realmente vinculados à compra; tipo inventado é recusado.
53. Pedido com vários itens mantém uma avaliação independente por `(tipo, pedido, origem, produto)` e a tela abre o item correto.
54. Autor consegue mudar apenas nota/comentário e não altera pedido, produto, autoria, moderação nem resposta do vendedor.
55. Só a equipe do parceiro, o profissional dono ou a operação FitMind autorizada responde; `seller_reply_by_profile_id` registra quem escreveu.
56. Listagem pública não expõe `order_id`/`order_type`; a RPC de avaliações próprias devolve somente linhas do perfil autenticado.
57. Bloquear o autor remove sua avaliação da lista e do resumo de notas nos dois sentidos definidos para perfis.
58. Bloquear parceiro/profissional remove vendedor, catálogo e reputação correspondentes e não deixa a resposta reaparecer por RPC `SECURITY DEFINER`.
59. Denunciar a avaliação captura nota/comentário no servidor e atribui o sujeito ao comprador correto.
60. Denunciar a resposta captura somente a resposta e atribui o sujeito ao vendedor/perfil que respondeu, não ao comprador.
61. Ocultar avaliação remove a unidade completa; ocultar resposta preserva a avaliação. Recurso aceito restaura apenas o alvo correto e nunca desfaz ação posterior ativa.
62. Caminhos com separador codificado, dupla codificação, `%` residual, `..`, barra invertida, query, fragmento ou caractere de controle são recusados.
63. Job `processing` recente mantém o lease; job abandonado há mais de dez minutos volta para retry e, na décima falha, termina explicitamente em `dead`.
64. Quarentena copia a evidência privada, mas não remove um objeto ainda referenciado por outro post.
65. Se uma nova ocultação for aplicada enquanto a restauração antiga está em andamento, o post permanece oculto e o objeto recriado por aquela tentativa não fica público.
66. O purge de mensagem de grupo mantém o snapshot até o job de remoção de `group-media` concluir; somente a execução posterior redige a evidência.
67. Avaliação/resposta com denúncia aberta não pode ser editada; resposta ocultada não pode ser republicada enquanto a ação estiver ativa, e o recurso nunca sobrescreve texto posterior.

## Evidências para o dossiê da Play

Guardar capturas datadas (sem PII) do aceite, menus de denúncia/bloqueio em mensagens, avaliações e respostas, Central de Segurança, fila administrativa, decisão, recurso por segundo moderador e remoção de mídia. Registrar versão do app, hash Git, migrations aplicadas e resultado dos 67 casos. Isso demonstra o fluxo, mas não substitui monitoramento contínuo e resposta humana às denúncias.
