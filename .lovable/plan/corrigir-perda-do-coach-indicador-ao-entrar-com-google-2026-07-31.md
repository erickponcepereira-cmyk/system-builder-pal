# Corrigir perda do coach indicador ao entrar com Google

## O que está acontecendo

Existem dois caminhos de indicação hoje:

- `/r/{codigo}` — valida o código no banco e grava o coach completo (id + nome). Esse caminho continua funcionando.
- `?ref={codigo}` (links da loja pública e de produto, `/loja?ref=`, `/produto/{id}?ref=`) — grava **apenas o texto do código**, sem consultar quem é o coach. `coachId` e nome ficam nulos.

No retorno do Google, a tela "Completar cadastro" só trava o indicador quando existe `coachId`. Como no caminho `?ref=` ele é nulo, a tela mostra o seletor de coach vazio — a pessoa escolhe outro coach ou nenhum, e a indicação original se perde. O código do indicador chega ao servidor, mas o cadastro é gravado com o coach escolhido na tela, não com o do link.

Além disso, o servidor aceita hoje qualquer `coachId` enviado pela tela, sem conferir contra o código de indicação — então nada corrige o desvio depois.

## O que será feito

1. **Resolver o coach na hora do clique do link**
   Sempre que um link público trouxer `?ref={codigo}`, consultar o código no banco (mesma validação usada em `/r/{codigo}`) e guardar o coach completo — id, nome e parceiro — junto com o código. Mantida a regra de primeiro toque: um link genérico posterior não sobrescreve o coach que trouxe a pessoa.

2. **Garantir a resolução também no retorno do Google**
   Na tela "Completar cadastro", se chegar só o código sem o coach resolvido (link antigo, storage parcialmente perdido no celular/APK), resolver o código ali mesmo antes de montar o formulário e travar o indicador, como já acontece no fluxo `/r/{codigo}`.

3. **Trava no servidor (rede de segurança)**
   Ao concluir o cadastro vindo do Google, se houver código de indicação, o servidor resolve o coach a partir do código e usa esse coach — ignorando divergência vinda da tela. Sem código válido, segue o coach escolhido manualmente.

4. **Persistência mais resistente ao redirect**
   Antes de sair para o Google, gravar o backup durável da indicação sempre que houver código (hoje o backup só grava em parte dos casos) e mantê-lo até o cadastro concluir.

## Detalhes técnicos

- `src/lib/atribuicao.ts`: `capturarAtribuicaoDaUrl` passa a ter versão assíncrona que chama a RPC `validate_referral_code` e grava `coachId`/`coachNome`/`parceiroId`; enriquece registro já existente que tenha só o código.
- `src/lib/public-store.ts`: `readReferralContext` usa a versão enriquecida (sem quebrar a assinatura atual usada por `loja.tsx` e `produto.$id.tsx`).
- `src/lib/referral-signup.ts`: `persistReferralForOAuth` grava o backup em `localStorage` sempre que houver `code`, não só quando há `coachId`.
- `src/routes/complete-signup.tsx`: quando `ref.code` existe e `ref.coachId` é nulo, resolver via `validate_referral_code` antes de exibir o formulário; só mostrar o `CoachSelector` se o código não resolver.
- `src/lib/google-signup.functions.ts` (`completeGoogleStudentSignup`): resolver `referralCode` no servidor e sobrepor `coachId` quando o código for válido.

Sem mudanças de banco.
