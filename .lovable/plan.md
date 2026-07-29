## Problema

Nas duas telas (PIX e cartão), o erro é o mesmo:

```
VALIDATION: too_big, maximum 200, path: ["deviceId"]
```

O checkout envia o device fingerprint do Mercado Pago (`MP_DEVICE_SESSION_ID`), gerado pelo `security.js`. Esse identificador hoje vem bem maior que 200 caracteres, mas o validador em `src/lib/mercadopago.functions.ts` limita a 200 (`z.string().max(200)`) tanto em `createPixCheckout` quanto em `createCardCheckout`. Como o antifraude foi ativado, todo pagamento passa a enviar esse valor e ambos os fluxos falham antes de chegar ao Mercado Pago — não é problema de recorrência em si, é o checkout inteiro.

## Correção

1. **`src/lib/mercadopago.functions.ts`**
   - Ampliar o limite do `deviceId` para um teto seguro (ex.: 4000 caracteres) nos dois validadores.
   - Tornar o campo tolerante: se vier maior que o teto ou inválido, seguir sem o device id em vez de derrubar o pagamento (o fingerprint é opcional para o Mercado Pago; ele só melhora a aprovação).

2. **`src/lib/mercadopago.ts` (`getDeviceId`)**
   - Normalizar o valor retornado (trim) e devolver `null` quando estiver vazio, para não enviar lixo ao servidor.

3. **`createCardCheckout`**
   - Hoje ele lança exceção crua e a mensagem técnica aparece para o usuário ("Pagamento recusado: [{ code: too_big ... }]"). Passar a retornar erro limpo/legível como o fluxo PIX já faz, para que falhas de validação nunca vazem JSON na tela.

## Validação

- Testar compra do produto recorrente de R$ 1,00 nos dois modos: "Assinar (cobrança automática)" com cartão e "Pagar só desta vez" com PIX, confirmando que o QR é gerado e o cartão é processado.
