## Diagnóstico confirmado agora (medido do sandbox)

Os três pontos que você levantou estão corretos e foram verificados:

1. **Dois certificados separados** — o apex tem `CN=fitmindclub.com.br` com SAN só do apex; o www tem `CN=www.fitmindclub.com.br` com SAN só do www. Não existe um certificado único cobrindo os dois.
2. **Redirect do www passa por HTTP puro** — `http://www.fitmindclub.com.br` responde `302 → http://fitmindclub.com.br/` (HTTP!), que só então faz `301 → https://fitmindclub.com.br/`. Ou seja: há um salto em texto puro no meio do caminho. É exatamente isso que o Chrome/antivírus/proxy de operadora derruba em alguns aparelhos (ERR_CONNECTION_CLOSED / "não pode fazer conexão segura").
3. **Só cadeia ECDSA** — emissor Google Trust Services WE1, assinatura `ecdsa-with-SHA256`, chave `id-ecPublicKey`. Não há cadeia RSA alternativa, o que quebra aparelhos Android/Windows antigos.

## O que já fiz

Enviei o pedido formal ao time da Lovable com as três solicitações e as evidências medidas (saída de `openssl s_client` e das chamadas `curl -I`), explicando que são usuários reais em produção sendo bloqueados.

## Importante: nada disso se resolve no código

Certificado, cadeia TLS e o redirect de borda do domínio customizado ficam na camada de hospedagem da Lovable. Não existe arquivo neste projeto que altere isso — nem `_redirects`, nem rota, nem middleware, porque a resposta 302 do www acontece antes de qualquer código do app rodar.

## Mitigação opcional enquanto o time não aplica

Se quiser reduzir o impacto agora, dá para:

1. **Definir o apex como domínio primário** em Project Settings → Domains, para que a divulgação (WhatsApp, bio, materiais) use sempre `https://fitmindclub.com.br` e nunca `www` — assim o salto HTTP do www deixa de ser acionado no fluxo normal.
2. **Padronizar todos os links gerados pelo app** (indicação, loja, e-mails) para o apex HTTPS. Isso já está feito em `src/lib/auth-redirects.ts`, mas posso varrer o restante do código atrás de qualquer link ainda montado com `www` ou com o `origin` atual.
3. **Orientar os casos remanescentes** para `https://fitmindclub.lovable.app`, que serve o mesmo app e ajuda a separar problema de domínio próprio vs. aparelho.

Me diga se quer que eu execute a mitigação 2 (varredura e padronização de links para o apex HTTPS) — as outras duas são ações suas no painel e na comunicação.

&nbsp;

**A mitigação 1 pode fazer já**, definir o apex como domínio primário no painel. É inofensiva e correta de qualquer jeito.

**O pedido formal à Lovable está certo e deve seguir** — certificado único cobrindo os dois nomes, cadeia RSA além da ECDSA, e o redirect do `www` indo direto para HTTPS. São defeitos reais, independentemente de serem ou não a causa deste caso.