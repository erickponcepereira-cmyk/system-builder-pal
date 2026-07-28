## O que verifiquei agora

- DNS de `fitmindclub.com.br` e `www.fitmindclub.com.br` aponta corretamente para 185.158.133.1.
- `https://fitmindclub.com.br/` responde **200** e `www` redireciona para a raiz. Ou seja: **o servidor e o domínio estão saudáveis** — o problema é no aparelho/navegador do usuário.

## Causa mais provável (confirmada no código)

Existe um conflito entre dois arquivos:

- `public/sw.js` hoje é um **worker de limpeza**: ao ativar, apaga caches, força `client.navigate(url)` (recarrega a aba) e se desregistra.
- `src/pwa-register.ts` continua **registrando `/sw.js` em produção**.

Resultado em produção: a cada visita o app registra o worker → o worker recarrega a página e se desregistra → na recarga registra de novo. Em aparelhos mais lentos ou com cache antigo isso aparece como **tela branca, site que "não abre" ou recarrega infinitamente**, exatamente em "alguns" celulares/computadores (os que já tinham o SW antigo instalado ou HTML cacheado).

## Correção proposta

1. **Parar o loop**: remover a chamada de registro do service worker em produção (`registerAppServiceWorker` passa a apenas *desregistrar* qualquer SW do app e limpar caches). Assim o worker de limpeza roda uma única vez por aparelho e nunca mais volta.
2. **Manter o kill-switch** em `public/sw.js` por mais um ciclo, mas sem o `client.navigate()` agressivo (evita o refresh forçado que causa a tela branca), preservando a limpeza de caches e o `unregister()`.
3. **Não tocar** em workers de push/mensageria.
4. **Instalação como app**: continua funcionando via `manifest.webmanifest` (Adicionar à tela inicial). Sem service worker o Chrome pode não oferecer o banner automático de instalação — o botão já existente segue funcionando. Se você quiser o banner de volta, isso vira uma entrega separada, com PWA feito corretamente.

## Página de diagnóstico e recuperação

Criar `/diagnostico` (já existe uma rota com esse nome — vou revisar e reaproveitar) mostrando:

- domínio/origem acessada, versão do build, se há service worker registrado, quais caches existem;
- botão **"Limpar e recarregar"** que desregistra todos os SWs do app, apaga caches e recarrega.

Assim, quando alguém disser "não abre", você manda o link `fitmindclub.com.br/diagnostico?sw=off` e resolve na hora.

## Se ainda houver aparelho que não abre

Aí o problema não é o site, e sim rede/DNS local (operadora, DNS do roteador, Wi-Fi corporativo). O checklist que vou documentar na própria página: testar em rede móvel (4G/5G) vs Wi-Fi, e testar `https://fitmindclub.lovable.app` — se o `.lovable.app` abre e o domínio próprio não, é DNS do aparelho/rede, não do sistema.

## Detalhes técnicos

- Arquivos alterados: `src/pwa-register.ts`, `public/sw.js`, `src/routes/diagnostico.tsx`.
- Sem mudanças em banco de dados, autenticação ou regras de negócio.
- Necessário **publicar** depois da mudança para que os aparelhos afetados recebam o novo HTML.
