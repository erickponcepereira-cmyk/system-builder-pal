# Conector WhatsApp — FitMind Club

Este programa liga um celular ao FitMind. É ele que recebe a mensagem
"Confirmar meu cadastro na FitMind: FIT-XXXX" e libera a conta da pessoa.
Sem ele rodando, a tela de cadastro fica esperando para sempre.

## O que você precisa

- Um computador que fique ligado com internet.
- O Node.js instalado (baixe em https://nodejs.org — versão LTS).
- O Google Chrome instalado (o conector usa o Chrome que já existe na máquina;
  se não houver, ele tenta o Microsoft Edge).
- O celular com o número oficial da plataforma, com WhatsApp ativo.

## Passo a passo

1. Copie esta pasta (`conector-whatsapp`) para o computador, **fora do OneDrive**
   (por exemplo `C:\conector-whatsapp`). Dentro do OneDrive a instalação falha
   com erros `EPERM`, porque a sincronização trava os arquivos.
2. Abra o **PowerShell** dentro dela e rode o instalador preparado para Windows:

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar-windows.ps1
   ```

   Ele limpa instalações incompletas e instala as dependências sem baixar outro
   navegador. Em uma pasta nova, `npm install` também funciona normalmente.

3. No FitMind, entre em **Admin → WhatsApp da plataforma**, cadastre o número
   (se ainda não existir) e copie o **ID da conexão** e a **Chave de conexão**.
4. Renomeie o arquivo `.env.example` para `.env` e preencha os três campos.
   No Windows, o jeito mais seguro é abrir o PowerShell na pasta e rodar
   `Copy-Item .env.example .env` (renomear pelo Explorer costuma criar `.env.txt`).
   Se preferir, pode simplesmente preencher o próprio `.env.example`: o conector
   também lê dele quando não existe `.env`.


5. Rode:

   ```
   npm start
   ```

6. Vai aparecer um QR Code no terminal. No celular: **WhatsApp → Configurações →
   Aparelhos conectados → Conectar aparelho** e aponte a câmera.
7. Pronto. No painel o número passa a aparecer como **conectado**.

O pareamento fica salvo na pasta `sessao/` — nas próximas vezes ele sobe direto,
sem pedir QR de novo.

## Cuidados

- Não use esse mesmo número em outro WhatsApp Web: isso derruba a sessão.
- Se o computador reiniciar, rode `npm start` de novo (ou configure para iniciar junto).
- Nunca compartilhe a chave de conexão: ela é a senha do conector.

## Se algo der errado

- **`EPERM: operation not permitted` no `npm install`**: feche terminais antigos e
  navegadores, confirme que a pasta está em `C:\conector-whatsapp` e execute:

  ```
  powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar-windows.ps1
  ```

- **`Failed to set up chrome ...` no `npm install`**: sobrou um download quebrado do
  Puppeteer. O mesmo reparador limpa esse cache e impede uma nova tentativa:

  ```
  powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar-windows.ps1
  ```

  O conector não baixa mais navegador: ele usa o Chrome já instalado.
- **"Não encontrei o Google Chrome"**: instale o Chrome ou preencha `CHROME_PATH`
  no arquivo de configuração com o caminho completo do `chrome.exe`.
- **"faltam dados de configuração"**: o conector mostra a pasta, o arquivo que leu e
  quais campos estão vazios. Preencha-os ou rode `Copy-Item .env.example .env`.
- **"conexao ou segredo invalido"**: o ID ou a chave no `.env` estão errados.
- **Fica pedindo QR toda hora**: apague a pasta `sessao/` e pareie de novo.
- **Número aparece desconectado no painel**: confira se o terminal ainda está
  aberto e se o computador está na internet.

