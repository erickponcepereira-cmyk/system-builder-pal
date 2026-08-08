# Corrigir definitivamente a instalação do conector WhatsApp

## Diagnóstico confirmado

O erro principal não é mais o OneDrive. O `npm` está ignorando as duas linhas da `.npmrc` porque `puppeteer_skip_download` e `PUPPETEER_SKIP_DOWNLOAD` não são configurações válidas de projeto nessa versão. Por isso o instalador do Puppeteer ainda tenta baixar o Chrome e encontra o cache anterior incompleto.

O aviso `EPERM` vem da pasta `node_modules` deixada pela instalação que falhou. Os avisos de `glob` e `fluent-ffmpeg` são dependências indiretas e não são a causa da interrupção.

## Correção

1. **Trocar a configuração inválida** por `puppeteer.config.cjs`, formato oficialmente lido pelo instalador atual, com `skipDownload: true` para o Chrome e Firefox.
2. **Remover a `.npmrc` inválida**, eliminando os avisos “Unknown project config”.
3. **Fixar a versão do `whatsapp-web.js` e gerar o lock de dependências**, evitando que uma instalação futura baixe silenciosamente outra versão do Puppeteer.
4. **Adicionar um instalador para Windows** que encerra resíduos do navegador, limpa `node_modules` e o cache incompleto do Puppeteer, define a variável de segurança na própria execução e instala novamente. Assim o primeiro reparo não depende apenas do arquivo de configuração.
5. **Atualizar o LEIAME e o painel Admin → WhatsApp da plataforma** com um único comando de reparo e deixar claro que o conector usa o Chrome/Edge já instalado.
6. **Validar uma instalação limpa** confirmando que não existe tentativa de download do Chrome e que `npm start` encontra o navegador local.

## Solução imediata no computador atual

Enquanto a nova pasta do conector não é baixada, abra o **PowerShell como Administrador** em `C:\conector-whatsapp` e execute:

```text
Get-Process chrome,msedge,node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\puppeteer" -ErrorAction SilentlyContinue
$env:PUPPETEER_SKIP_DOWNLOAD="true"
npm install
```

Esse comando impede o download nesta instalação específica; a alteração do projeto fará isso automaticamente nas próximas.