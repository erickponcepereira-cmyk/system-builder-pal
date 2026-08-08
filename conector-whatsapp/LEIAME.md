# Conector WhatsApp — FitMind Club

Este programa liga um celular ao FitMind. É ele que recebe a mensagem
"Confirmar meu cadastro na FitMind: FIT-XXXX" e libera a conta da pessoa.
Sem ele rodando, a tela de cadastro fica esperando para sempre.

## O que você precisa

- Um computador que fique ligado com internet.
- O Node.js instalado (baixe em https://nodejs.org — versão LTS).
- O celular com o número oficial da plataforma, com WhatsApp ativo.

## Passo a passo

1. Copie esta pasta (`conector-whatsapp`) para o computador.
2. Abra o terminal dentro dela e rode:

   ```
   npm install
   ```

3. No FitMind, entre em **Admin → WhatsApp da plataforma**, cadastre o número
   (se ainda não existir) e copie o **ID da conexão** e a **Chave de conexão**.
4. Renomeie o arquivo `.env.example` para `.env` e preencha os três campos.
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

- **"conexao ou segredo invalido"**: o ID ou a chave no `.env` estão errados.
- **Fica pedindo QR toda hora**: apague a pasta `sessao/` e pareie de novo.
- **Número aparece desconectado no painel**: confira se o terminal ainda está
  aberto e se o computador está na internet.
