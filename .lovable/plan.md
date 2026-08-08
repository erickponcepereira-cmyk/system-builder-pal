# Conector não lê o .env — corrigir de vez

O arquivo enviado ainda se chama `.env.example`. O conector só lê `.env`, então ele sobe sem nenhum dado e mostra "Faltam dados no .env". No Windows isso é comum: ao renomear, o Explorer costuma salvar como `.env.txt` (com a extensão escondida), e o problema se repete.

## O que vou fazer

1. **O conector passa a aceitar variações do arquivo**: procura, nesta ordem, `.env`, `.env.txt`, `.env.example.txt` e, por último, `.env.example`. Achando qualquer um com os três campos preenchidos, ele sobe normal.
2. **Mensagem de erro que ajuda**: em vez de só "faltam dados", ele passa a dizer qual arquivo encontrou, quais campos estão vazios e o caminho exato onde procurou.
3. **Instruções atualizadas** no `LEIAME.md` e no painel (Admin → WhatsApp da Plataforma): como renomear no Windows com as extensões visíveis, ou simplesmente preencher o `.env.example` e deixar o conector ler dali.

## Solução imediata (enquanto isso)

No PowerShell, dentro da pasta `conector-whatsapp`:

```text
Copy-Item .env.example .env
npm start
```

Isso já resolve hoje, sem esperar a atualização.

## Detalhes técnicos

- Em `conector-whatsapp/index.js`, trocar `import "dotenv/config"` por carregamento explícito com `dotenv.config({ path })` percorrendo a lista de candidatos via `fs.existsSync`.
- Validação dos três campos com relatório individual do que falta, antes de inicializar o cliente do WhatsApp.
