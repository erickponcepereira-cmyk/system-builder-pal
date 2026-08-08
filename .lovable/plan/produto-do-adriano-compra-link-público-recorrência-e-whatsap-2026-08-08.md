# Produto do Adriano: compra, link público, recorrência e WhatsApp da plataforma

## O que está acontecendo

O produto "Condomínio Chapada do Poente" (profissional, R$ 20,00, recorrência mensal com cartão salvo, 30 dias de carteirinha + 1 ticket) está aprovado, ativo e restrito à rede do coach Adriano — a restrição já aponta para o coach correto.

Três problemas confirmados:

1. **Nem o Adriano nem a rede dele conseguem comprar.** A regra de bloqueio olha apenas o coach direto do aluno. O Adriano, como aluno, está vinculado ao coach acima dele, então ele mesmo é barrado. Um aluno de um coach que está abaixo do Adriano também é barrado, porque só o vínculo direto é considerado.
2. **O link público não abre o produto.** A página `/produto/{id}?ref=XZH6DZ` carrega o produto no servidor sem levar em conta o código de indicação. Como o produto é restrito, ele é filtrado e aparece "Produto não encontrado". O código `XZH6DZ` é exatamente o código do Adriano, ou seja, o link está certo — falta a página usá-lo.
3. **Não existe onde cadastrar o número de WhatsApp da plataforma.** A confirmação de conta procura um número de plantão do escopo "plataforma", e hoje só existe tela de cadastro de números dentro do painel de Parceiro (escopo parceiro/atendimento). Por isso aparece "Nenhum número de WhatsApp disponível no momento".

Sobre a recorrência: a configuração do produto está correta e o motor de assinatura existe (assinatura criada quando o pagamento é confirmado, cobrança automática por rotina agendada). Ainda não há nenhuma assinatura gerada porque nenhuma compra foi concluída — o bloqueio impediu. A validação real só é possível depois da correção do item 1.

## O que será feito

### 1. Liberar compra para o coach dono e toda a rede abaixo

Trocar a checagem de "coach direto" pela cadeia completa de coaches acima do comprador (função de hierarquia já existente no sistema), e liberar explicitamente:
- o próprio coach autorizado (comprando como aluno);
- qualquer pessoa cuja cadeia de coaches passe por um coach autorizado (rede abaixo, em qualquer profundidade);
- o criador do produto e administradores.

Vale para produtos de parceiro e de profissional.

### 2. Link público respeitar o código de indicação

Na página `/produto/{id}`, ler o `?ref=` no carregamento do servidor, resolver o código para o coach correspondente e usar esse coach na busca do produto. Assim o link do Adriano abre o produto normalmente (inclusive com prévia no WhatsApp), e continua escondido para quem chega sem indicação autorizada.

### 3. Validar a venda recorrente ponta a ponta

- Conferir se a rotina automática de cobrança das assinaturas está agendada e ativa; se não estiver, agendá-la.
- Após a correção, revisar o caminho: pagamento aprovado → assinatura criada com valor/intervalo do produto → próxima cobrança agendada → entrega dos 30 dias de carteirinha e do ticket em cada renovação.
- Ajustar o que falhar nesse caminho para este tipo de produto.

### 4. Tela de WhatsApp da plataforma no Admin

Nova página no Admin ("WhatsApp da plataforma") para:
- cadastrar/listar números de escopo plataforma, com nome, prioridade e limite diário;
- ver o status (aguardando pareamento / conectado / desconectado) e o último sinal recebido;
- copiar a chave de conexão usada pelo aplicativo que fica pareado com o celular;
- arquivar/reativar número e definir qual é o principal.

Com um número conectado ali, a confirmação por WhatsApp no cadastro passa a funcionar. Enquanto nenhum número estiver conectado, a tela de cadastro continua oferecendo o caminho por e-mail.

## Detalhes técnicos

- `enforce_product_network_restriction`: passar a usar `cadeia_coaches_do_perfil` do perfil do comprador, com bypass para o dono do produto (`coach_id`/`partner_id`) e para admin.
- `catalogo_publico_produto` já aceita `_coach_id`; a correção é no `loader` de `src/routes/produto.$id.tsx`, resolvendo `?ref=` via `validate_referral_code` no servidor e repassando para `fetchPublicProduct`.
- Recorrência: `resolveSourceRecurrence` + `chargeDueSubscriptions` (rota `api/public/hooks/recurring-charge`); verificar o agendamento pg_cron e a criação de `recurring_subscriptions` a partir de `partner_product_orders` com `professional_product_id`.
- Admin WhatsApp: CRUD em `bot_conexoes` com `escopo = 'admin'` e `uso = 'plataforma'`, compatível com `bot_escolher_conexao` e com o webhook `api.bot.eventos`.
