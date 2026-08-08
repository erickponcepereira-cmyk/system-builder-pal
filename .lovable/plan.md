# Conector WhatsApp: erro ao instalar no Windows

Dois problemas se somaram no seu `npm install`:

1. A pasta está dentro do **OneDrive** (`Desktop\conector-whatsapp`). O OneDrive trava arquivos enquanto sincroniza, e por isso apareceu `EPERM: operation not permitted, rmdir ... node_modules`.
2. O `whatsapp-web.js` traz o Puppeteer, que tenta **baixar um Chrome próprio** (~150 MB). O download falhou pela metade e ficou uma pasta quebrada em `C:\Users\erick\.cache\puppeteer`, então toda nova tentativa falha no mesmo ponto.

## O que vou mudar no conector

1. **Não baixar mais o Chrome**: fixar `PUPPETEER_SKIP_DOWNLOAD` no próprio projeto (arquivo `.npmrc` na pasta do conector), para a instalação nunca depender desse download.
2. **Usar o Chrome/Edge que já existe no seu PC**: o conector passa a procurar automaticamente o Chrome e o Edge nos caminhos padrão do Windows (e aceita `CHROME_PATH` no `.env` se você quiser apontar manualmente). Se não achar nenhum, mostra uma mensagem clara dizendo para instalar o Chrome.
3. **LEIAME atualizado** com o procedimento correto:
   - mover a pasta para fora do OneDrive (ex.: `C:\conector-whatsapp`);
   - apagar `node_modules` e a pasta quebrada `C:\Users\erick\.cache\puppeteer`;
   - `npm install` e `npm start`.

## O que você faz agora (já resolve, antes mesmo da atualização)

No PowerShell:

```text
Move-Item "$env:USERPROFILE\OneDrive\Desktop\conector-whatsapp" C:\conector-whatsapp
cd C:\conector-whatsapp
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\puppeteer" -ErrorAction SilentlyContinue
npm install
npm start
```

(atenção: você digitou `npm instal` com um "l" só; o correto é `npm install`)

## Detalhes técnicos

- Novo `conector-whatsapp/.npmrc` com `puppeteer_skip_download=true`.
- Em `index.js`, resolver `executablePath` testando, nesta ordem: `process.env.CHROME_PATH`, Chrome em Program Files / Program Files (x86) / LocalAppData, e Edge como alternativa; passar o resultado em `puppeteer.executablePath` do `Client`.
- `.env.example` e `LEIAME.md` ganham a variável opcional `CHROME_PATH` e o aviso sobre OneDrive.
