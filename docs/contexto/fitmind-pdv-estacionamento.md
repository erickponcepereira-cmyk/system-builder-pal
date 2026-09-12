---
name: fitmind-pdv-estacionamento
description: "PDV de estacionamento e lavagem: o alvo é um SmartApp dentro da Point Smart, e os dois atritos do motor de venda que definiram a estrutura"
metadata:
  node_type: memory
  type: project
  modified: 2026-09-09T00:00:00.000Z
---

Frente aberta em 09/09/2026. Desenho completo em
`C:\dev\fitmind-bugs\docs\PDV-ESTACIONAMENTO.md` — este arquivo guarda só o que
uma sessão nova precisa saber antes de abrir aquele.

**O alvo é um app rodando dentro da maquininha**, não um tablet ao lado dela.
Decisão do Erick, revisada no mesmo dia em que a frente nasceu. No Mercado Pago
isso se chama **SmartApp**: app **Android nativo**, privado, distribuição
fechada, com SDK local para cartão, QR, câmera e **impressora**. Verificado na
doc oficial em 09/09/2026, não de memória.

**O que trava e não se resolve com código:** o processo só começa depois de
contato com o **time comercial** do MP; o desenvolvimento exige um **terminal
Point Smart de desenvolvimento** pedido ao consultor (a maquininha comum não
serve); cada APK passa por **homologação**; e WebView/Flutter não constam como
suportados — ou seja, **empacotar a rota do FitMind com Capacitor e instalar na
Point não é caminho**. Point Smart 2 é Android 12, tela 5,5", 2 GB de RAM.

**As duas gerações servem para SmartApp** (suporte do MP, 09/09/2026): Point
Smart = **A910, Android 6, minSdk 23**; Point Smart 2 = **N950, Android 12,
minSdk 31**. O modo PDV/Orders API lista Smart 1, Smart 2, Pro 2 e Pro 3. Ou
seja, a maquininha que o Erick já tem serve para os dois caminhos — o preço é
mirar Android 6. Verificar cedo a **cadeia de certificados TLS no A910**, que é
hardware de 2015. E **nenhuma maquininha de campo serve para desenvolver**: o
kit exige terminal com USB liberado e depuração ativa, fornecido pelo MP.

**Restrições de homologação que decidem projeto** (lista completa no documento
grande): **WebView é proibido**, por escrito — encerra qualquer ideia de
reaproveitar a UI React. Terminais são **AOSP sem Google Play Services**, então
**não existe push**: comunicação é *polling*, o que confirma o molde do
`api.bot.fila`. Pagamento, impressão, câmera e Bluetooth **só pelo SDK do MP**,
nunca por permissão de manifest. Armazenamento externo proibido → fila offline
no armazenamento interno. Token e segredo **no Android Keystore**, nunca em
SharedPreferences ou SQLite. Biometria proibida → operador entra por PIN. A
lista de permissões é fechada em onze. Pacote `com.fitmind.pdv`, sem a marca do
MP no nome nem logo.

**OAuth: resolvido em 09/09/2026 pelo MP.** No modelo A **não existe OAuth** —
não há a FitMind autorizando a si mesma. Usa-se as credenciais de produção da
própria aplicação: **Public Key no app, Access Token só no backend**. A FitMind
é a vendedora porque é a conta que recebe (o `user_id` da loja/caixa é o da
conta que recebe). OAuth Authorization Code só no modelo B, com token **no
servidor** e renovação antes de **180 dias**. Consulta, cancelamento e estorno
saem do backend; o SDK local só processa a cobrança.

**A restrição que muda a estratégia:** terminal em **modo PDV não recebe
SmartApp** — modos exclusivos no mesmo aparelho. A ponte web não é caminho
paralelo permanente, é o estágio anterior: migrar um terminal para SmartApp
exige tirá-lo do modo PDV. `pdv_terminais.modo` vira **regra** no servidor
(recusa order para terminal SmartApp, recusa pareamento em terminal PDV).

Outros achados da mesma resposta: homologação é **do aplicativo**, uma vez — não
por parceiro —, mas configuração, OAuth e associação de terminal/loja/caixa
acontecem por conta parceira. **Cada caixa comporta um terminal**, e loja e caixa
exigem **endereço e localização reais** do estabelecimento. O MP **exige versões
para os dois modelos** (A910 e N950), o que transformou a decisão de duas
variantes em requisito.

**O único bloqueio real que sobrou** é comercial, não técnico: a documentação
**não confirma** que o modelo de a FitMind receber as vendas dos parceiros e
repassar internamente seja aceito, nem confirma split para Point presencial.
**O modelo A é premissa, não fato confirmado.** A aprovação comercial formal
precisa existir **antes de escrever SQL de carteira (fase 4b) e antes da
homologação (fase 6)** — construir o app sem ela tudo bem, submeter não. Se for
recusado, o caminho documentado é o modelo B: cada conta titular autoriza a
aplicação por OAuth. Regulatório, contratual, fiscal e contábil não são decisão
do MP nem nossa — vão para o jurídico e a contabilidade da FitMind.

Por isso a fase 4 foi partida: **4a registra o rateio** (neutro, roda em
produção sem risco) e **4b executa o efeito** (crédito, saque, cobrança), que é
a única que espera. **Decidido em 09/09/2026: segue-se a 4a** — escopo de
construção é 1, 2, 3 e 4a.

**A linha que separa as duas é `process_partner_product_order_paid`:** chamar
essa função **é** o efeito financeiro — ela lança em `admin_system_wallet_entries`,
insere em `commissions` e roda `recalc_partner_wallet`/`recalc_wallet_for_profile`.
Não existe criar o pedido de parceiro "sem creditar". Por isso a 4a **não encosta
em `partner_product_orders`**: grava o rateio nas tabelas do PDV e para. A trava
de não mostrar saldo disponível fica **estrutural** — sem `commissions` e sem
`recalc_*`, `partner_wallets` e `wallet_statement` não veem nada. O único cuidado
é não plugar o relatório do PDV no `wallet_statement`; ele lê `pdv_vendas` e
rotula **a repassar**.

**Saque reusa o que já existe** (decisão do Erick, 09/09/2026): `partner_wallets`
+ `recalc_partner_wallet` + `wallet_statement` + `request_seller_withdrawal_atomic`
+ `can_withdraw` + `withdrawal_requests` + `admin_mark_withdrawal_paid`. Sem tabela,
tela ou carência paralela — o PDV é mais uma **origem** de evento financeiro, não
um segundo sistema. `pdv_vendas.modelo_recebimento` é gravado desde a primeira
venda para que o histórico saiba sob qual regra nasceu, e todo efeito financeiro
entra por uma função só, `pdv_processar_venda_paga`.

**Por isso a estrutura é um núcleo e duas superfícies.** Tabelas, tarifa,
ticket, venda, rateio e a API de dispositivo pareado (`/api/pdv/*`, no molde de
`api.bot.*` e `autenticarConector`) são **idênticos** nos dois caminhos. Só muda
como o pagamento é acionado: SDK local no SmartApp, `POST /v1/orders` no modo
PDV remoto. A superfície web existe para operar enquanto a homologação não sai —
e vira retaguarda depois, não lixo.

**Consequência boa da maquininha:** o ticket de entrada sai **impresso** pelo
próprio terminal, e a carteirinha FitMind é lida pela **câmera** dele. Isso
derrubou a decisão anterior de mandar comprovante por WhatsApp.

**Estado em 12/09/2026.** Fase 1 (tabelas do pátio + régua) e fase 2a (operar o
pátio) estão **escritas e commitadas, nenhuma aplicada** — as tabelas `pdv_*`
respondem 404 em produção. A rota é `/pdv`, fora do painel de parceiro pela
mesma razão de `/academia`: quem opera a guarita não cuida de carteira. O gate é
`pode(unidade, "pdv.operar")`, e as duas permissões novas já entraram em
`src/lib/unidades-parceiro.ts` — sem isso elas existiriam no banco e ninguém
conseguiria atribuir, porque `PartnerMembersPanel` itera `PERMISSOES`.

**A régua de preço não é duplicada no front.** `pdv_patio` devolve minutos e
valor já calculados; `src/lib/pdv-patio.ts` só trata placa e formatação de
tempo. Se a tela somasse frações, existiriam duas réguas — a que cobra e a que o
cliente lê.

**Os dois atritos do motor** (achados lendo o código, não supostos):

- `partner_product_orders.student_id` é **NOT NULL**. Venda anônima — a regra no
  rotativo — não passa por lá. A venda do PDV nasce em `pdv_vendas` e só **vira**
  pedido de parceiro quando há cliente identificado.
- `create_partner_product_order` **tira o preço do produto**. Estacionamento por
  tempo só sabe o valor na saída. **Não alterar** essas duas funções do motor
  para caber preço variável — elas processam dinheiro real hoje. Caminho novo é
  função irmã.

**Extensão certa para o pagamento:** o webhook já quebra `external_reference` em
`kind:id` e chama `applyApproval(kind, id)` — o PDV entra como `SourceKind` novo
(`pdv_sale`). Rota **separada** para orders: `api.public.mp.webhook.ts` já
carrega quatro fluxos e está no limite.

A taxa da Point por modalidade (débito, crédito, parcelado) não existe em
`taxas_vigentes`, que só tem `maquininha_cartao` e `maquininha_pix` — ver
[[fitmind-sistema-de-taxas]] antes de cravar percentual em qualquer lugar, e
jamais dentro do APK. Rateio e carteira em [[fitmind-financeiro]]; o operador do
PDV é um `partner_members` com permissão `pdv`, e na maquininha entra por PIN.
