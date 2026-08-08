# Fazer a confirmação por WhatsApp realmente funcionar

Hoje a tela gera o código (ex.: `FIT-VQCP`) e fica esperando a mensagem chegar. Ela nunca chega porque falta a peça que lê o WhatsApp: um programa conector, pareado com o celular, que entrega ao FitMind as mensagens recebidas. A "chave de conexão" que aparece no admin é justamente a senha desse programa — sem ele rodando, o número nunca fica "conectado" e o cadastro trava esperando.

## O que vou entregar

1. **O programa conector** (pasta `conector-whatsapp/` no projeto, para você baixar e rodar num computador que fique ligado):
   - Ao iniciar, mostra um QR Code no terminal. Você abre o WhatsApp do número **+55 65 99294-7754** → Aparelhos conectados → Conectar aparelho → aponta a câmera. Pareado uma vez, continua valendo.
   - Avisa o FitMind que está "conectado" (o número passa a aparecer verde no admin).
   - Repassa toda mensagem recebida. Quando chega "Confirmar meu cadastro na FitMind: FIT-XXXX", o servidor confere o código, confirma a conta e a tela de cadastro sai sozinha do "Esperando sua mensagem…".
   - Também envia as mensagens que o sistema colocar na fila (avisos, funil), respeitando o limite diário configurado.
   - Reconecta sozinho se cair a internet e manda um "estou vivo" a cada minuto.
2. **Instruções passo a passo** dentro do próprio admin (Admin → WhatsApp da Plataforma): baixar, instalar, colar a chave, parear, e o que fazer se cair.
3. **Sem número conectado, sem promessa quebrada**: a opção "Confirmar por WhatsApp" só aparece no cadastro quando existir pelo menos um número realmente conectado; caso contrário o cadastro segue por e-mail sem travar.
4. **Aviso na tela de espera**: se passar ~60 s sem resposta, a tela oferece "confirmar por e-mail" em destaque em vez de girar para sempre.

## Como isso valida na prática

O código do print (`FIT-VQCP`) fica guardado no servidor por 30 minutos, amarrado ao e-mail do cadastro. Quando o conector entrega uma mensagem contendo esse código, o servidor: confere o código, guarda o telefone de quem mandou, marca a conta como confirmada e libera o login. É a prova de que o número é da pessoa — ela precisou enviar do próprio WhatsApp.

## O que você precisa fazer

- Deixar um computador (ou notebook) ligado com internet — é onde o conector roda.
- Instalar o Node.js nele (uma vez).
- Rodar o conector, colar a chave de conexão do admin e parear com o QR Code usando o número 65 99294-7754.
- Manter esse número **fora** do WhatsApp Business Web em outro lugar, para não desconectar a sessão.

## Detalhes técnicos

- Conector em Node.js com `whatsapp-web.js` (Chromium headless), sessão persistida em `LocalAuth` para não pedir QR toda vez.
- Fala apenas com as rotas já existentes: `POST /api/bot/eventos` (status, batimento, mensagem), `GET /api/bot/fila` (pendentes) e `POST /api/bot/confirmar` (enviada/erro), autenticando com os cabeçalhos `x-bot-conexao` e `x-bot-segredo`.
- Configuração por `.env` do conector: URL base, id da conexão e segredo — nada fica embutido no código.
- Nenhuma mudança de banco é necessária: `bot_conexoes`, `bot_conversas`, `bot_mensagens` e `bot_verificacoes` já existem, assim como `bot_confirmar_verificacao`.

## Alternativa (fora do escopo agora)

Se depois você não quiser depender de um PC ligado, dá para migrar para a API oficial da Meta (WhatsApp Cloud API), que envia direto por webhook e não precisa de máquina local — exige conta Business verificada e tem custo por conversa.
