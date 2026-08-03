# Corrigir "Dado obrigatório" no titular do cartão (cartão de terceiro)

## O que está acontecendo

O checkout hoje pede os dados do titular **duas vezes**:

1. Um bloco próprio nosso ("Dados do titular do cartão": nome + CPF/CNPJ), acima do formulário.
2. Os campos do próprio formulário do Mercado Pago ("Nome do titular como aparece no cartão" e "Documento do titular").

Na foto, os campos do Mercado Pago estão preenchidos com "José M C Nunes" e o CPF, mas continuam marcados em vermelho como "Dado obrigatório" e o botão exibe "Preencha todos os dados para continuar". Isso acontece porque o preenchimento automático do navegador (autofill, que já tinha os dados do bloco de cima) escreve o valor no campo sem disparar o evento que o formulário do Mercado Pago escuta — para ele, o campo continua vazio. O usuário vê o dado na tela e o botão trava.

A duplicação de campos é o que provoca o autofill nesses dois campos e também confunde o cliente quando o cartão é de outra pessoa (esposa comprando com cartão do marido).

## Correção proposta

1. **Fim da duplicação**: remover os dois inputs próprios de titular. Os campos oficiais do Mercado Pago (nome do titular + documento do titular) passam a ser a única fonte da verdade. Fica só um aviso curto: "O cartão pode estar em nome de outra pessoa — preencha nome e documento exatamente como no cartão."
2. **Bloquear o autofill nos campos do Mercado Pago**: após o formulário carregar, desativar o preenchimento automático nesses campos, para que o navegador não volte a inserir valores "fantasma" que travam a validação.
3. **Rede de segurança**: se ainda assim um campo aparecer preenchido mas não reconhecido, disparar o evento de digitação para o formulário revalidar sozinho.
4. **Validação no envio**: manter a checagem de nome completo (2 palavras) e CPF/CNPJ válido, agora usando os dados vindos do próprio formulário do Mercado Pago, com mensagem em português caso algo falte.

## O que NÃO muda

- O payload enviado ao Mercado Pago continua idêntico: comprador (payer) e titular (holder) seguem separados, mesmos campos, mesmo device fingerprint, mesmo 3-D Secure, mesma gravação de cartão para recorrência.
- Nada muda no relatório/conciliação do MP, nos webhooks, no PIX, nas assinaturas ou nas regras antifraude — não há novos bloqueios, só a remoção dos campos duplicados.

## Detalhes técnicos

- Arquivo: `src/components/payments/MercadoPagoCheckout.tsx`.
- Remover estado `holder` / `holderRef` / inputs duplicados; derivar titular de `cardFormData` via `buildCardPayer` (nome do titular e `identification.number` já vêm do Brick) e continuar enviando `holder: { name, doc }` para `createCardCheckout` — assinatura do server function inalterada.
- No callback `onReady` do Brick: percorrer os inputs do container (`cardholderName`, `identification*`) definindo `autocomplete="off"` e, se `value` estiver preenchido, disparar `input`/`change` bubbling para sincronizar o estado interno do Brick.
- Manter `holderError` como mensagem de validação exibida acima do formulário.
- Nenhuma alteração em `mercadopago-impl.server.ts`, webhooks ou banco.
