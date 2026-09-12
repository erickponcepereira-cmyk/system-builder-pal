# PDV FitMind — Estacionamento e Lavagem

Documento de estrutura, escrito em 09/09/2026, antes de qualquer linha de código.
**Revisado no mesmo dia**: o alvo passou a ser um aplicativo rodando **dentro da
maquininha** Point Smart, não um tablet ao lado dela. A seção 2 explica o que
isso muda e o que custa.

Repositório: `C:\dev\fitmind-bugs`, branch `main`.
Leia antes: [`CLAUDE.md`](../CLAUDE.md),
[`docs/contexto/fitmind-financeiro.md`](contexto/fitmind-financeiro.md) e
[`docs/contexto/fitmind-sistema-de-taxas.md`](contexto/fitmind-sistema-de-taxas.md).

---

## 1. O que é

Um ponto de venda para parceiros que operam **estacionamento** e **lavagem de
carro**. O atendente escolhe o serviço, o carro e o cliente, cobra, e o dinheiro
entra no mesmo motor financeiro que a FitMind já usa.

**O que ele não é:** não é sistema de comissão novo, não é catálogo novo, não é
conta de pagamento nova. Produto continua sendo cadastrado no painel de parceiro;
comissão, rede, carteira e benefícios continuam sendo o motor existente.

O risco declarado deste repositório é duplicação. Este documento é, em boa parte,
a lista do que **não** vamos reescrever.

---

## 2. Onde o PDV roda — a decisão de 09/09/2026

O pedido é que o atendente do lava-jato faça tudo **na própria maquininha**:
escolher produto, tempo, valor e cliente, e cobrar ali mesmo.

**Isso é possível e tem nome: SmartApp.** Verificado na documentação oficial do
Mercado Pago em 09/09/2026, não de memória.

### O que o Mercado Pago permite

Um SmartApp é um aplicativo **Android nativo, privado, de distribuição fechada**,
instalado nos terminais Point Smart da própria conta. O SDK do terminal dá
acesso a:

- pagamento com cartão — chip, NFC e tarja — crédito, débito e pré-pago;
- pagamento por QR (Pix e carteiras);
- **câmera** para leitura de QR e código de barras;
- **impressão de comprovante customizado**;
- Bluetooth e login.

Na prática, a Point Smart 2 é um Android 12 com tela de 5,5", 2 GB de RAM,
impressora térmica embutida, câmera, 4G e Wi-Fi. Duas consequências boas e
imediatas para esta frente:

- **O ticket de entrada sai impresso na hora**, sem impressora extra e sem
  depender do WhatsApp do parceiro estar conectado. Isso derruba a decisão de
  comprovante que tínhamos tomado horas antes.
- **A carteirinha FitMind é lida pela câmera do próprio terminal** — o QR que já
  existe, com `partner_scan_student`, sem hardware novo.

### Qual maquininha serve

Levantado em 09/09/2026, e a resposta **muda conforme o caminho**:

**As duas gerações servem para SmartApp** — confirmado pelo suporte do Mercado
Pago em 09/09/2026, que informou o sistema operacional de cada uma:

| Terminal | Hardware | Sistema | `minSdkVersion` |
|---|---|---|---|
| **Point Smart** (a "normal") | A910 | **Android 6** | **23** |
| **Point Smart 2** | N950 | Android 12 | 31 |

E para o caminho remoto (modo PDV / Orders API) a documentação lista **Point
Smart 1, Point Smart 2, Point Pro 2 e Point Pro 3**. Ou seja: a maquininha que
já existe serve para os dois caminhos.

**Duas variantes de build**, `minSdk 23` para a A910 e `minSdk 31` para a N950.
Decidido em 09/09/2026 — e no mesmo dia o Mercado Pago confirmou que **exige
versões prontas para os dois modelos**. Ou seja, deixou de ser preferência e
virou requisito; a única coisa ainda não confirmada é se a entrega é uma
aplicação com dois APKs ou duas aplicações (item para o time de integrações,
antes de empacotar).

O que isso exige na prática:

- **Um código, dois _product flavors_ do Gradle.** Toda a regra — tarefa, ticket,
  fila, sincronização, chamadas de API — mora num módulo comum, compartilhado.
  O que varia por variante fica isolado em _source set_ próprio.
- **Dois APKs, dois ciclos de homologação, duas matrizes de teste.** Correção de
  bug vale para as duas: publicar só numa cria frota com comportamento
  divergente, que é o pior estado possível para depurar de longe.
- **Nenhuma regra de negócio pode viver só numa variante.** Se aparecer a
  tentação de "isso só a Smart 2 faz", ou vira recurso opcional detectado em
  tempo de execução, ou não entra.
- `app_versao` em `pdv_dispositivos` guarda **variante + versão**, senão não se
  sabe qual APK está em campo em qual terminal.

> Armadilha a verificar cedo: **cadeia de certificados TLS em Android 6.**
> Dispositivo dessa idade tem raízes antigas e já quebrou com emissores modernos.
> Testar a conexão com o backend do FitMind no A910 **antes** de escrever tela.

**Nenhuma maquininha de campo serve para desenvolver**: o kit exige um terminal
com USB liberado e depuração ativa, fornecido pelo Mercado Pago. A que está em
campo pode, no máximo, ser terminal de produção depois da homologação.

### O que isso custa

Estas são as restrições reais, e nenhuma delas é contornável por código:

| Restrição | Efeito |
|---|---|
| **O processo só começa depois de contato com o time comercial** do Mercado Pago | Nada de técnico pode começar antes. É o item de maior prazo e não depende de nós |
| **Precisa de um terminal de desenvolvimento** fornecido pelo consultor comercial (USB liberado e depuração ativa) | A maquininha comum não serve para desenvolver |
| **Android nativo, e WebView é proibido** — não "não suportado": proibido, por escrito | O app do FitMind é Capacitor, ou seja, WebView. **Não existe caminho de empacotar a rota `/pdv` e instalar na Point.** O SmartApp é código novo, em Kotlin |
| **Homologação do APK pelo Mercado Pago** | Cada versão passa por aprovação. Acabou o ciclo de publicar correção em minutos que o Lovable permite hoje |
| **Distribuição fechada, terminal a terminal** | Atualização não é instantânea em N maquininhas |
| **Tela de 5,5" e 2 GB de RAM** | Uma tarefa por tela. Mapa de pátio com 40 vagas não cabe, e app pesado engasga |

### As regras que o app terá que cumprir

Repassadas pelo suporte do Mercado Pago em 09/09/2026. Não são recomendações —
são condição para passar na homologação. O que cada uma significa para nós:

**Proibições que mudam o projeto**

| Regra | O que muda aqui |
|---|---|
| **WebView proibido** | Encerra a discussão sobre reaproveitar a UI React. Kotlin nativo |
| **Sem Google Play Services** (os terminais são AOSP puro) | **Sem FCM, ou seja, sem push.** O servidor não consegue "avisar" o terminal — quem pergunta é o terminal, por *polling*. Confirma o molde do `api.bot.fila`. Também sem Google Maps e sem login Google |
| **Pagamento, impressão, câmera e Bluetooth só pelo SDK do Mercado Pago**, nunca por permissão declarada no manifest | A leitura do QR da carteirinha usa a câmera **do SDK**, não CameraX. A impressão do ticket idem |
| **Armazenamento externo proibido** (`READ`/`WRITE`/`MANAGE_EXTERNAL_STORAGE`) | A fila offline vive no armazenamento **interno** do app (Room/SQLite interno, que não exige permissão) |
| **Token e segredo não podem ficar em SharedPreferences nem SQLite** | O segredo do pareamento vai para o **Android Keystore** |
| **Biometria proibida** (`USE_BIOMETRIC`, `USE_FINGERPRINT`) | Operador entra por **PIN**, como já estava desenhado |
| **`SYSTEM_ALERT_WINDOW`, `QUERY_ALL_PACKAGES`, USB para dados, serviços de acessibilidade** — todos proibidos | Sem overlay, sem inspecionar o aparelho, sem carga por cabo |
| **`allowBackup`, `debuggable`, `testOnly`, `cleartextTrafficPermitted`** proibidos no release | Higiene de build; entra no checklist antes de mandar APK |
| **Sem a marca "Mercado Pago"/"Mercado Libre"** no nome, no pacote ou em logo. Sem ícone de rede social | Nome do pacote: `com.fitmind.pdv` — alfanumérico, domínio reverso, sem hífen |

**Permissões liberadas** (a lista é fechada, só estas): `INTERNET`,
`ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`, `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK`, `VIBRATE`,
`FLASHLIGHT`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`.

Três delas resolvem exatamente os nossos problemas: `RECEIVE_BOOT_COMPLETED` faz
o app voltar sozinho quando a maquininha reinicia no meio do expediente,
`SCHEDULE_EXACT_ALARM` agenda a sincronização da fila, e `POST_NOTIFICATIONS`
avisa o operador localmente — que é o substituto do push que não existe.

**OAuth — respondido pelo Mercado Pago em 09/09/2026**

A dúvida cara está resolvida, e a favor do modelo A:

- **No modelo A não existe OAuth.** Não há "FitMind autorizando a própria
  FitMind". Com terminais e conta próprios, usa-se as **credenciais de produção
  da aplicação**: *Public Key* no app, **Access Token só no backend**.
- A FitMind **é a vendedora** perante a integração, porque é a conta que recebe.
  O `user_id` da loja e do caixa é o da conta que recebe os pagamentos.
- **OAuth (Authorization Code) só entra no modelo B**, quando o app opera em nome
  de contas de terceiros. Nesse caso o token é gerenciado **pelo servidor**,
  nunca pelo terminal, e precisa ser **renovado antes de 180 dias**.
- Consulta, cancelamento e estorno saem do **backend autenticado**. O SDK local
  cuida só de processar a cobrança no dispositivo.

Ou seja, o desenho já estava certo: o APK não carrega segredo, quem fala com a
API do Mercado Pago é o servidor. A única correção é que *Public Key* no app é
legítima — é chave pública, feita para isso.

**A restrição que muda a estratégia: modo PDV e SmartApp não convivem**

Um terminal em **modo PDV não pode receber o SmartApp**. São modos mutuamente
exclusivos **no mesmo aparelho**.

Isso não derruba a estratégia de duas superfícies, mas muda a natureza dela: a
ponte web **não é um caminho paralelo permanente no mesmo terminal**, é o estágio
anterior. Quando o SmartApp for homologado, cada terminal que for recebê-lo
precisa **sair do modo PDV** — é migração com janela, não atualização suave.

Consequências práticas:

- Parceiro com **um** terminal escolhe um modo por vez. Se quiser os dois
  caminhos ao mesmo tempo, precisa de dois terminais.
- `pdv_terminais.operating_mode` deixa de ser informação e vira **regra**: o
  servidor recusa mandar order para terminal marcado como SmartApp, e recusa
  parear SmartApp em terminal marcado como modo PDV.
- O plano de migração de cada parceiro entra no painel: qual terminal está em
  qual modo, e o que muda para o operador no dia da troca.

**Segurança exigida:** nada de credencial em texto plano (usar ofuscação),
AES-128 ou mais, SHA-256 ou mais — DES, RC4 e MD5 estão fora —, TLS em toda
comunicação, Keystore para dados sensíveis, e análise de dependências com
ferramenta tipo Snyk ou Sonatype antes de submeter.

### A estratégia: um núcleo, duas superfícies

O trabalho se divide em duas partes de tamanho muito diferente:

```
        ┌──────────────────────────────────────────────┐
        │  NÚCLEO  (~80% do trabalho, serve aos dois)  │
        │  tabelas · tarifa · ticket · venda           │
        │  rateio · comissão · carteira · benefício    │
        │  API de dispositivo pareado                  │
        └───────────────┬──────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ↓                               ↓
  SmartApp na Point Smart        Web /pdv em celular
  (Kotlin, SDK local)            (Point em modo PDV,
  ALVO                            Orders API)  PONTE
```

O núcleo é **idêntico** nos dois caminhos. Só a superfície e a forma de acionar
o pagamento mudam.

**Recomendação:** abrir a conversa comercial com o Mercado Pago **agora**, porque
é o que tem prazo mais longo e não depende de código, e construir o núcleo em
paralelo. Enquanto a homologação não sai, a superfície web deixa o parceiro
operando com a Point em modo PDV. Quando o SmartApp for aprovado, ele consome a
mesma API e a superfície web vira retaguarda (relatório, cadastro, fechamento) —
nada do que foi feito é jogado fora.

Se a preferência for esperar a homologação e não ter ponte, é só não construir a
superfície web. O núcleo não muda.

---

## 3. Decisões tomadas em 09/09/2026

| Decisão | Escolha | Consequência |
|---|---|---|
| Onde o PDV roda | **SmartApp dentro da Point Smart** (alvo), com web `/pdv` como ponte | App nativo separado do bundle React; núcleo compartilhado por API |
| Gerações atendidas | **Duas variantes**: `minSdk 23` (A910) e `minSdk 31` (N950) | Um código, dois flavors, dois ciclos de homologação |
| Cobrança do estacionamento | Por tempo (tabela de tarifa) **+** mensalista/vaga fixa **+** valor fixo por entrada | Três réguas; a régua é escolhida na entrada e **congela** no ticket |
| Cliente sem cadastro | Venda anônima por padrão, cadastro rápido opcional | `pdv_vendas.student_id` nulo quando anônimo. A placa é a chave |
| Comprovante da entrada | **Impresso no terminal** | WhatsApp vira reforço opcional, não o caminho principal |
| Conta Mercado Pago | Modelo A — todas as Points na conta FitMind | Um access token, um webhook, N terminais. Repasse ao parceiro é interno |

Efeito colateral que precisa estar escrito: **venda anônima não gera benefício
nem comissão de rede.** Ela credita o parceiro e a plataforma, nada mais. Se o
cliente quiser reivindicar a compra depois, isso é fase posterior.

---

## 4. O que já existe e vamos reaproveitar

Levantado lendo o código em 09/09/2026.

| Peça | Onde | Para que serve aqui |
|---|---|---|
| Motor de venda de parceiro | `partner_product_orders`, `create_partner_product_order`, `process_partner_product_order_paid` | Rateio, comissão, rede 10/5/3, carteira, benefícios |
| Webhook Mercado Pago | `src/routes/api.public.mp.webhook.ts` | Idempotência, conferência de valor, `raw_webhook` sempre gravado |
| Ponte de origem do pagamento | `src/lib/mercadopago-impl.server.ts` — `SourceKind`, `loadSource`, `applyApproval` | **O ponto de extensão.** O PDV entra como `SourceKind` novo |
| Formato do `external_reference` | `kind:id`, quebrado com `split(":")` | O PDV usa `pdv_sale:<uuid>`, sem convenção nova |
| **API de dispositivo pareado** | `src/routes/api.bot.*.ts` + `autenticarConector` | **O molde da API do SmartApp.** Pareamento por código e segredo, exatamente como o agente da catraca |
| Taxas | `taxas_vigentes` + `taxa_vigente(data)` | Fonte única. Taxa nova = **linha nova com data**, nunca `UPDATE` |
| Produtos do parceiro | `partner_products` | Lavagem e agregados cabem aqui **sem tabela nova** |
| Equipe do parceiro | `partner_members(partner_id, profile_id, papel, permissoes[])` | Operador é membro com permissão `pdv`. Não existe usuário de PDV |
| Carteirinha / QR | `partner_scan_student`, `partner_preview_student` | Identificar cliente já está pronto; na Point a leitura é pela câmera do terminal |
| Padrão offline | `C:\dev\fitmind-conector` | Fila local, só conexão de saída |

### Como o SmartApp autentica

Não embute credencial do Supabase e não faz login de usuário na maquininha. Ele
se pareia como dispositivo, igual ao agente da catraca:

```
Painel do parceiro → [ PAREAR MAQUININHA ] → código de 6 dígitos
        ↓
SmartApp digita o código uma vez
        ↓
recebe pdv_dispositivo_id + segredo, guarda no terminal
        ↓
toda chamada em /api/pdv/* leva os dois no cabeçalho
```

O terminal fica amarrado a um parceiro. Quem opera se identifica por PIN curto
na abertura do turno — digitar e-mail e senha em tela de 5,5" a cada troca de
atendente não sobrevive à operação real.

---

## 5. Os dois atritos do motor

Achados lendo o código, não supostos. Valem para os dois caminhos.

**1. `partner_product_orders.student_id` é NOT NULL.**
Venda anônima não passa por lá — e no rotativo a maioria é anônima. Por isso a
venda do PDV nasce em `pdv_vendas` e **vira** pedido de parceiro só quando há
cliente identificado.

**2. `create_partner_product_order` tira o preço do produto.**
Estacionamento por tempo só sabe o valor na saída. Lavagem e preço fixo usam o
caminho existente; o preço calculado usa função irmã.

> **Regra desta frente:** não altere `create_partner_product_order` nem
> `process_partner_product_order_paid` para caber preço variável. Elas processam
> dinheiro real hoje. O caminho novo é `pdv_gerar_pedido_de_venda`, que insere em
> `partner_product_orders` com os valores já calculados e chama o processamento
> existente. Auditado na Fase 0 antes de escrever.

---

## 6. Modelo de dados

Nomes em português, como as frentes novas do repo. Prefixo `pdv_`. Todas com
`partner_id` e RLS por parceiro.

### Pátio e tarifa

```
pdv_vagas
  id · partner_id · codigo ('A03') · setor · tipo (comum|coberta|moto|pcd|idoso|eletrico)
  ativa · ordem
  UNIQUE (partner_id, codigo)

pdv_tarifas
  id · partner_id · nome ('Rotativo dia útil') · vigente_desde
  tolerancia_min                                 (ex. 15)
  primeira_fracao_min · primeira_fracao_valor    (ex. 60 → R$ 10,00)
  fracao_adicional_min · fracao_adicional_valor  (ex. 30 → R$ 3,00)
  teto_periodo_valor · valor_fixo
  regra (tempo|fixo) · dias_semana[] · hora_inicio · hora_fim · ativa
```

Tarifa **nunca** é editada: régua nova é linha nova com `vigente_desde`, igual a
`taxas_vigentes`. O passado fica intacto por construção.

### Veículo, ticket e mensalista

```
pdv_veiculos
  id · partner_id · placa (normalizada) · modelo · cor
  student_id (nullable) · cliente_nome · cliente_telefone
  UNIQUE (partner_id, placa)

pdv_tickets
  id · partner_id · numero · veiculo_id · placa · vaga_id (nullable)
  entrada_em · saida_em · fechado_em
  tarifa_id · tarifa_snapshot (jsonb)      ← congelada na entrada
  mensalista_id (nullable)
  minutos_permanencia · valor_calculado
  status (aberto | aguardando_pagamento | pago | cortesia | cancelado)
  cortesia_motivo · autorizado_por_profile_id
  operador_entrada · operador_saida · comprovante_impresso_em

pdv_mensalistas
  id · partner_id · student_id (nullable) · cliente_nome · cliente_telefone
  placas[] · vaga_id (nullable) · valor_mensal · dia_vencimento
  vigente_de · vigente_ate · status (ativo|vencido|cancelado)
```

Carro de mensalista abre ticket normalmente — o ticket é o registro de
permanência —, só não gera cobrança na saída. Sem isso o pátio mente sobre
ocupação.

### Venda, itens e pagamento

```
pdv_vendas
  id · partner_id · turno_id · operador_profile_id · dispositivo_id
  numero ('PDV-000123')
  student_id (nullable) · cliente_nome · cliente_telefone
  ticket_id (nullable) · subtotal · desconto · total
  status (aberta | aguardando_pagamento | paga | cancelada | estornada)
  external_reference ('pdv_sale:<uuid>')
  modelo_recebimento ('fitmind' | 'parceiro')   ← sob qual regra foi gravada
  criada_em · paga_em · cancelada_em · metadata (jsonb)

pdv_venda_itens
  id · venda_id · tipo (estacionamento | produto | servico)
  partner_product_id (nullable) · ticket_id (nullable)
  descricao · quantidade · valor_unitario · valor_total
  partner_product_order_id (nullable)

pdv_pagamentos
  id · venda_id · meio (point_local | point_remoto | dinheiro | pix_qr | carteira_fitmind)
  valor · status (pendente | aprovado | recusado | cancelado | estornado)
  dispositivo_id · terminal_id · mp_order_id · mp_payment_id
  bandeira · parcelas · nsu · autorizacao
  taxa_estimada · taxa_real · liquido_real
  criado_em · aprovado_em · raw (jsonb)
```

`meio` separa `point_local` (SDK dentro da maquininha) de `point_remoto`
(Orders API). Os dois convivem **no mesmo parceiro**, com terminais diferentes —
nunca no mesmo aparelho, porque terminal em modo PDV não recebe SmartApp.

### Dispositivo, maquininha e caixa

```
pdv_dispositivos
  id · partner_id · apelido ('Point Guarita 1')
  segredo_hash · mp_terminal_id · serial · modelo
  app_versao · ultimo_contato_em · status (ativo|inativo|bloqueado)
  pareado_em · pareado_por_profile_id

pdv_terminais
  id · partner_id · mp_terminal_id · serial · mp_store_id · mp_pos_id
  modo (pdv_remoto | smartapp)        ← exclusivo, vira regra no servidor
  status (online|offline|desvinculado) · ultima_ordem_em
  loja_endereco · loja_cidade · loja_uf · loja_cep · loja_lat · loja_lng

pdv_turnos
  id · partner_id · operador_profile_id · dispositivo_id
  aberto_em · fechado_em · fundo_troco
  dinheiro_esperado · dinheiro_contado · diferenca · sangrias (jsonb)
```

Turno não é burocracia: sem ele não há como saber quem recebeu o dinheiro que
faltou. Em estacionamento é exatamente aí que vaza.

O endereço da loja não é enfeite: o Mercado Pago exige que **loja e caixa
registrem endereço e localização reais**, e **cada caixa comporta um único
terminal**. Não dá para cadastrar N estabelecimentos no endereço da FitMind — o
provisionamento precisa dos dados cadastrais efetivos de cada parceiro, e isso
tem que estar disponível antes de pedir a criação da loja por API.

### Ponte com o motor financeiro

Uma função, no banco, chamada quando o pagamento é aprovado:

```
pdv_processar_venda_paga(_venda_id uuid)
  ├─ marca venda paga e ticket pago
  ├─ item COM student_id:
  │     cria partner_product_orders (rateio por taxa_vigente)
  │     chama process_partner_product_order_paid → comissão, rede, carteira, benefício
  └─ item SEM student_id (anônimo):
        crédito do parceiro + fatia do sistema direto no ledger,
        sem comissão de coach e sem rede
```

**Toda lógica de rateio mora no banco, uma vez só.** Já houve duplicação de régua
em TS nesta base e teve que ser consolidada em SQL — não repita, ainda mais agora
que existe um cliente nativo que ficaria com a terceira cópia.

---

## 7. Fluxos

### Entrada (na maquininha)

```
[ ENTRADA ]
  ↓
placa — teclado grande, Mercosul e antigo
  ↓
placa conhecida? → puxa modelo, cor, cliente e histórico
  ↓
vaga (opcional) · tarifa
  ↓
mensalista com essa placa? → abre ticket sem cobrança
  ↓
grava ticket: entrada_em = now(), tarifa congelada
  ↓
IMPRIME o ticket    (placa · vaga · entrada · tarifa · nº do ticket)
```

### Saída e cobrança (na maquininha)

```
[ SAÍDA ] → digita as 3 últimas da placa, ou lê o ticket impresso
  ↓
pdv_calcular_tarifa(ticket_id, now()) → minutos + valor
  ↓
soma serviços do carro (lavagem etc.)
  ↓
cliente? [ Ler QR da carteirinha ]  [ CPF/telefone ]  [ Sem cadastro ]
  ↓
cria pdv_vendas + itens
  ↓
[ COBRAR ] → SDK do terminal: crédito · débito · Pix por QR · dinheiro
  ↓
callback do SDK com aprovado/recusado
  ↓
confirma no servidor → pdv_processar_venda_paga → ticket pago, vaga liberada
  ↓
IMPRIME o comprovante
```

**A confirmação é do servidor, não da tela.** O callback do SDK acelera a
interface, mas a fonte da verdade é o webhook / a consulta ao Mercado Pago —
mesma disciplina que o webhook atual já aplica ao checkout.

### Lavagem

Produto do parceiro, cadastrado no painel que já existe. Duas entradas: avulsa
(só lava) ou vinculada ao ticket (lava enquanto está estacionado). O item ganha
status próprio — `na_fila`, `lavando`, `pronto`, `entregue` — porque o atendente
precisa saber o que devolver antes de liberar o carro.

### Combo

Um carro, um ticket, uma venda, dois itens. É por isso que `pdv_venda_itens`
existe em vez de a venda ter um produto só.

---

## 8. Pagamento: local x remoto

| | **SmartApp (local)** | **Modo PDV (remoto)** |
|---|---|---|
| Onde roda a tela | Na Point Smart | Celular/tablet/PC |
| Como cobra | SDK do terminal, chamada local | `POST /v1/orders` com `terminal_id` |
| Depende de internet para a UI | Não, só para confirmar | Sim |
| Confirmação | Callback do SDK **+** servidor | Webhook |
| Precisa de homologação | **Sim** | Não |
| Imprime | Sim, pelo SDK | Só com impressora à parte |
| Credencial | Public Key no app, Access Token no backend | Access Token no backend |
| **Convivem no mesmo terminal?** | **Não.** Terminal em modo PDV não recebe SmartApp | **Não** |
| Prazo para começar | Depois do comercial do MP | Imediato |

Nos dois casos o servidor recebe a mesma coisa: uma venda `pdv_sale:<uuid>` que
foi aprovada, com valor, meio, parcelas e identificadores do Mercado Pago.

**Do lado do servidor:**

- `SourceKind` novo (`pdv_sale`) em `mercadopago-impl.server.ts`, com
  `loadSource` e `applyApproval` correspondentes.
- Rota **separada** para o webhook de orders: `/api/public/mp/point-webhook`. O
  webhook atual já carrega quatro fluxos e está no limite.
- Endpoints do dispositivo em `/api/pdv/*`, no molde de `api.bot.*`.
- **Validar `x-signature`** no webhook novo — hoje isso não é feito em lugar
  nenhum, e o webhook atual se protege buscando o pagamento na API. Faça as duas
  coisas.
- Idempotência por `mp_order_id` **e** por venda: rede de maquininha cai e
  repete.
- Tratar antes de escalar: recusado, cancelado pelo operador, expirado, estorno,
  e o erro de mandar order para terminal que já tem outra pendente.

### Conciliação

Taxa estimada na hora (via `taxas_vigentes`), taxa real depois, pelo relatório
"Dinheiro em conta" do MP (`EXTERNAL_REFERENCE`, `FEE_AMOUNT`,
`SETTLEMENT_NET_AMOUNT`, `INSTALLMENTS`, `POS_ID`). `pdv_pagamentos` já tem as
três colunas.

> **A resolver na Fase 2:** `taxas_vigentes` só tem `maquininha_cartao` e
> `maquininha_pix`. Point tem débito, crédito à vista e parcelado com taxas
> diferentes. Isso vira coluna nova + linha nova de vigência — **não** um número
> cravado no código do PDV, e muito menos dentro do APK.

---

## 9. Telas na maquininha

Tela de 5,5", uma mão, atendente em pé, às vezes na chuva. A regra é **uma
decisão por tela e no máximo dois toques para a ação mais comum**. Padrão visual
do FitMind, sem identidade nova; **estado não segue a marca**: verde é em dia,
âmbar é atenção, vermelho é pendência.

### Início

```
┌──────────────────────────┐
│  Estacionamento Central  │
│  18 / 40 vagas           │
│                          │
│  ┌────────────────────┐  │
│  │      ENTRADA       │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │       SAÍDA        │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │   LAVAGEM / VENDA  │  │
│  └────────────────────┘  │
│                          │
│  Pátio · Caixa · Turno   │
└──────────────────────────┘
```

### Pátio — o formato pedido, adaptado à tela

Lista rolável, uma linha por carro, ordenada pelo mais antigo. Vaga, placa,
permanência e valor em duas linhas por item, porque quatro colunas não cabem em
5,5" sem virar letra ilegível:

```
┌──────────────────────────┐
│ 🔍 placa                 │
├──────────────────────────┤
│ A03   ABC-1D23           │
│ 2h41  ·  R$ 16,00     ›  │
├──────────────────────────┤
│ A07   QWE-4R56      🧼   │
│ 1h48  ·  R$ 13,00     ›  │
├──────────────────────────┤
│ B01   MEN-5A10           │
│ 4h23  ·  mensalista   ›  │
└──────────────────────────┘
```

Permanência e valor contam sozinhos. 🧼 marca carro com serviço em andamento —
não libera sem conferir. Toque na linha abre a saída.

> Na superfície web, essa mesma tela vira a tabela de quatro colunas do desenho
> original (vaga · placa · permanência · valor), que é onde ela funciona bem.

### Saída

```
┌──────────────────────────┐
│ ABC-1D23      Vaga A03   │
│ Entrada 09:12            │
│ Permanência 2h41         │
├──────────────────────────┤
│ Estacionamento  R$ 16,00 │
│ Lavagem simples R$ 40,00 │
│ ──────────────────────── │
│ TOTAL           R$ 56,00 │
├──────────────────────────┤
│ [ QR ] [ CPF ] [ sem ]   │
│ ┌────────────────────┐   │
│ │      COBRAR        │   │
│ └────────────────────┘   │
└──────────────────────────┘
```

Depois de cobrar, o SDK assume a tela de pagamento do Mercado Pago; na volta,
comprovante impresso e vaga liberada.

### Painel do parceiro (web, não é tela de maquininha)

Vagas, tarifas, mensalistas, maquininhas pareadas, operadores com permissão
`pdv`, relatório do dia e fechamento. Cadastro em tela de 5,5" é castigo — a
maquininha opera, o painel configura.

---

## 10. Permissões, RLS e auditoria

- Operador = `partner_members` com `'pdv'` em `permissoes`; na maquininha ele
  entra por PIN curto, amarrado a esse vínculo.
- O terminal autentica como dispositivo (`pdv_dispositivos`), com segredo
  guardado **hasheado** no servidor e, no terminal, no **Android Keystore** —
  `SharedPreferences` e SQLite são proibidos para isso pela homologação, e
  segredo em texto puro é o problema conhecido do `config.json` do conector.
- **Toda policy com `TO` explícito.** Sem ele o Postgres aplica a `PUBLIC`,
  incluindo `anon`.
- **Nunca consultar `profiles` dentro de policy** — use `is_admin()`.
- Decisão de UI que depende de tabela com RLS vai por RPC `SECURITY DEFINER`:
  política que devolve vazio **não dá erro**, o item só some da tela sem log.
- Cortesia, cancelamento, desconto e ajuste de horário são **auditados** com
  autor e motivo. É a superfície de fraude clássica de estacionamento.
- O APK **não** guarda access token do Mercado Pago nem chave do Supabase.
  Quem fala com o MP é o servidor; o terminal fala com o SDK local e com
  `/api/pdv/*`.

---

## 11. Offline

O estacionamento não pode parar quando a internet cai — e o SmartApp ajuda aqui,
porque a tela é local.

- **Funciona offline:** abrir ticket, fechar ticket, calcular valor, receber em
  dinheiro, imprimir. Fila local no **armazenamento interno** do app (cartão SD e
  storage externo são proibidos pela homologação), sincronizada quando a rede
  volta — mesmo espírito do `pendentes.json` do conector.
- **O servidor nunca "chama" o terminal.** Sem Google Play Services não há push:
  quem pergunta é o app, com `SCHEDULE_EXACT_ALARM` e `RECEIVE_BOOT_COMPLETED`
  garantindo que ele volte a perguntar depois de um reinício.
- **Não funciona offline:** cartão e Pix. Isso é limite do meio de pagamento, não
  do app. A tela precisa dizer isso, não falhar em silêncio.
- **Sincronizar agora**, botão visível, obrigatório.
- Número de ticket gerado offline leva prefixo do dispositivo para não colidir.
- O cálculo de tarifa roda no banco, mas o SmartApp precisa da mesma régua para
  operar offline. **Essa é a única duplicação aceita** — e a forma de aceitá-la é
  o servidor mandar a tarifa como dado (`tarifa_snapshot`), não a régua como
  código. Valor calculado offline é reconferido no servidor na sincronização.

---

## 12. Fases

Cada fase termina com `node node_modules/typescript/bin/tsc --noEmit` limpo
(linha de base 0 erros) e com o fluxo rodado de verdade, não só lido.

| Fase | Entrega | Verificação |
|---|---|---|
| **0. Comercial + auditoria** | Onboarding comercial: **validar formalmente o modelo de recebimento** (a FitMind recebendo vendas de estabelecimentos parceiros e repassando internamente), pedir terminal de desenvolvimento + Sandbox do SmartPOS, e confirmar o formato de entrega dos dois APKs. Em paralelo: ler `process_partner_product_order_paid` inteiro e decidir o caminho da venda anônima | Aval do modelo de recebimento **por escrito**; documento curto com a decisão de rateio e o SQL alvo |
| **1. Pátio no banco** | `pdv_vagas`, `pdv_tarifas`, `pdv_veiculos`, `pdv_tickets`, RLS das quatro, e `pdv_calcular_tarifa` | Ticket aberto e fechado por SQL com valor certo **nas bordas** (abaixo) · RLS provada com dois parceiros · `md5(prosrc)` conferido contra a migration |
| **2a. Pátio operável** *(escrito em 12/09/2026)* | `pdv_patio`, `pdv_abrir_ticket`, `pdv_veiculo_resumo`; rota `/pdv` com pátio, busca por placa e entrada; permissões no seletor de membros | `tsc` limpo · 42 testes verdes, 11 deles das funções de placa e permanência · falta aplicar o SQL |
| **2b. Venda e caixa** | `pdv_vendas`, `pdv_venda_itens`, `pdv_pagamentos`, **`pdv_turnos`**; saída, cobrança e recebimento em dinheiro. **Inclui a 4a** — nenhuma venda nasce sem rateio | Um dia real de operação, **fechando o caixa no fim** com a diferença explicada |
| **4a. Registro financeiro** | Rateio calculado pela **mesma régua** (`taxa_vigente`) e gravado em `pdv_vendas` / `pdv_venda_itens`. **Não cria `partner_product_order` e não chama o processamento**. Roda dentro da fase 2 | Cada venda sabe quanto é do parceiro, da plataforma, da rede e do imposto, e bate com `taxa_vigente`. Nenhuma carteira se move |
| **3. Point remoto** | `pdv_terminais`, criação de order, `point-webhook`, `SourceKind` novo, estados de recusa/cancelamento/expiração | Venda de teste em terminal virtual, depois uma real de R$ 1,00 · **webhook reentregue não duplica venda** · order para terminal que já tem outra pendente tratada, não estourando erro na cara do operador |
| **4b. Efeito financeiro** | Cria o pedido de parceiro e chama `process_partner_product_order_paid`; conciliação da taxa real | Painel, `wallet_statement` e carteira materializada têm que bater |
| **5. SmartApp** | **Primeiro:** provar TLS e conexão com o backend no A910. Depois: `pdv_dispositivos` e `/api/pdv/*` com pareamento; app Kotlin em **duas variantes** (`minSdk 23` e `minSdk 31`) sobre módulo comum — entrada, saída, cobrança pelo SDK, impressão, leitura de QR | Conexão provada no A910 **antes de escrever tela** · venda ponta a ponta no terminal de desenvolvimento, **nas duas variantes** |
| **6. Homologação** | Envio dos **dois APKs**, documentação, ajustes pedidos pelo MP. **Exige a aprovação comercial do modelo já obtida** | Checklist de manifest (só as onze permissões, sem `debuggable`/`allowBackup`/`cleartextTraffic`, pacote sem marca do MP) · varredura de dependências (Snyk ou Sonatype) · aprovação e distribuição para o primeiro terminal de cada geração |
| **7. Lavagem e cliente** | Produtos no PDV, fila de serviço, QR da carteirinha, cadastro rápido | Combo cobrado numa venda só, com rateio certo por item · cliente identificado gravado na venda. **A liberação do benefício só é verificável depois da 4b** |
| **8. Mensalista** | Contratos, vaga fixa, vencimento e bloqueio | Carro de mensalista abre ticket, ocupa vaga e sai sem cobrança; mensalista vencido é barrado |
| **9. Offline** | Fila local, sincronização, botão manual, prefixo de ticket por dispositivo | Expediente inteiro com a internet caída, e a volta sem ticket duplicado nem valor divergente |
| **10. Escala** | Painel de maquininhas, provisionamento de loja/caixa por API, **plano de migração de modo** (PDV ↔ SmartApp), vários terminais | Duas Points simultâneas sem cruzar venda · um terminal migrado de modo PDV para SmartApp sem perder histórico |

**Ordem de execução:** `0` (em paralelo, do primeiro dia) → `1` → `2 + 4a` →
`3` → `5` → `6` → `7` → `8` → `9` → `10`. A **4b** entra assim que o aval
comercial sair, e não antes.

As fases 5 e 6 **dependem da fase 0 ter destravado** — terminal de
desenvolvimento para a 5, aprovação do modelo para a 6. As fases 1, 2, 3, 4a, 8
e 9 não dependem de ninguém fora daqui. A **7 fica pela metade sem a 4b**:
identificar o cliente e gravar a venda funciona, liberar benefício não.

### As bordas que a fase 1 tem que provar

`pdv_calcular_tarifa` é uma função pequena com muitos casos de borda, e é ela que
define quanto o cliente paga. Cada um destes é um teste, não uma conferida de
olho:

- **Tolerância exata.** O carro que sai no minuto exato da tolerância paga zero
  ou paga a primeira fração? A régua de benefício desta base já foi mordida por
  isso — `> 150` em vez de `>= 150` custou o ticket de desafio de uma venda de
  R$ 150,00.
- **Fuso.** O banco é UTC, o pátio opera em `America/Cuiaba` (−04). Ticket aberto
  às 21h e fechado à 1h atravessa a meia-noite local **e** a do UTC em momentos
  diferentes. Teto diário, tarifa por faixa de hora e `dias_semana[]` têm que ser
  avaliados no **fuso do parceiro**, nunca em UTC.
- **Múltiplos dias.** Carro esquecido três dias: soma diárias, ou aplica o teto
  uma vez só? Definir antes de escrever, não depois de um cliente reclamar.
- **Tarifa trocada no meio.** O parceiro cria régua nova às 15h; o carro que
  entrou às 9h continua na antiga, porque a tarifa está congelada em
  `tarifa_snapshot`. Testar exatamente esse caso.
- **Permanência negativa ou zero.** Relógio do dispositivo errado, saída
  registrada antes da entrada. Nunca devolver valor negativo.

### O aval que a fase 4b exige

**Decidido em 09/09/2026: segue-se a 4a.** O escopo de construção é fases 1, 2,
3 e 4a. A 4b fica suspensa até a aprovação comercial do modelo.

**Onde exatamente a 4a para.** Ela cobra, recebe o dinheiro de verdade na conta
do Mercado Pago, calcula o rateio e grava quanto é do parceiro, da plataforma,
da rede e do imposto — **nas tabelas do PDV**. E para aí. Até a 4b, o repasse ao
parceiro é feito por fora, na mão.

**A linha que separa 4a de 4b é `process_partner_product_order_paid`.** Chamar
essa função **é** o efeito financeiro: ela marca o pedido pago, lança em
`admin_system_wallet_entries`, insere em `commissions` e roda
`recalc_partner_wallet` / `recalc_wallet_for_profile`. Não existe "criar o
pedido de parceiro sem creditar" — criar e marcar pago **é** creditar. Por isso
a 4a não encosta em `partner_product_orders`.

> **Trava enquanto a 4b não existir:** venda de PDV não pode aparecer como saldo
> disponível em superfície nenhuma de carteira. A boa notícia é que, com o
> desenho acima, essa trava é **estrutural, não defensiva**: se nada é gravado em
> `commissions` e nenhuma `recalc_*` roda, `partner_wallets` e `wallet_statement`
> simplesmente não enxergam o dinheiro. O cuidado que sobra é um só — **não
> plugar o relatório do PDV no `wallet_statement`**. Ele lê `pdv_vendas`, e
> rotula o valor como **a repassar**, nunca como disponível.

### Saque: reusa o que já existe

Decidido em 09/09/2026. O PDV **não ganha fluxo de saque próprio**. Quando a 4b
entrar, o crédito cai no mesmo lugar de sempre e o parceiro saca pelo caminho
que já funciona: `partner_wallets` alimentada por `recalc_partner_wallet`,
extrato consolidado em `wallet_statement`, pedido por
`request_seller_withdrawal_atomic` com a checagem de `can_withdraw`, registro em
`withdrawal_requests` e baixa administrativa por `admin_mark_withdrawal_paid`.

Nada de tabela nova, tela nova ou regra de carência paralela. Isso mantém a
regra do repositório: `financial_ledger_events` é a fonte canônica e
`wallet_statement` é quem consolida — o PDV vira mais uma **origem** de evento,
não um segundo sistema financeiro.

A divisão entre 4a e 4b existe por um motivo: **4a registra, 4b decide de quem é
o dinheiro**. Registrar o rateio é neutro — em qualquer modelo você precisa saber
quanto da venda é do parceiro, da plataforma, da rede e do imposto. O que muda é
o *efeito*: crédito a pagar ou valor a cobrar.

Errar isso não custa uma tela. Custa reinterpretar linhas de ledger já gravadas
com dinheiro real — a operação mais cara que existe nesta base, e que já
aconteceu duas vezes por muito menos (o pedido de R$ 1.280 pago no cartão e
processado como Pix; o backfill que moveu 16 vendas de dia no relatório).

São **três avais distintos**, e nenhum substitui o outro:

**1. Mercado Pago — comercial.** Aceita que terminais da conta FitMind operem em
endereços de estabelecimentos de terceiros, e que a receita dessas vendas entre
na conta da FitMind? O suporte foi explícito: a documentação não confirma, é
onboarding. Sem isso, o modelo A é premissa, não fato.

**2. Regulatório e contratual.** Receber por conta e ordem de terceiro e repassar
depois é diferente de vender em nome próprio, e encosta em regras de arranjo de
pagamento. Do lado do contrato com o parceiro, precisa estar escrito quem
recebe, em quanto tempo repassa, o que acontece em estorno e chargeback, e o que
pode ser retido. Isso é conversa para advogado da área — não é decisão de
engenharia.

**3. Fiscal e contábil.** Se R$ 1.000 entram na conta da FitMind, isso é receita
de R$ 1.000 com R$ 850 de custo, ou receita de R$ 150 de comissão com R$ 850 de
repasse de terceiro? A resposta muda base de cálculo, enquadramento e quem emite
nota para o consumidor final — o serviço é prestado pelo estacionamento, então a
nota do serviço é dele e a da comissão é da FitMind contra ele. Conecta direto
com a frente de NFS-e em `fiscal-engine`.

**O que muda no código conforme a resposta**

| | Modelo A (recebe a FitMind) | Modelo B (recebe o parceiro) |
|---|---|---|
| Credencial | Access Token da conta, no backend | OAuth por parceiro, token no servidor, renovar antes de 180 dias |
| Carteira do parceiro | Saldo **a pagar** pela FitMind | Extrato do que ele **já recebeu** |
| Comissão da FitMind | **Retida** antes do repasse | **Cobrada** dele — fatura, ou split se existir para Point |
| Comissão de rede e coach | Sai do bruto que a FitMind segura | Vira cobrança contra o parceiro |
| Saque | Existe | Não existe |
| Conciliação | Um relatório, uma conta | Um por conta parceira |

**O que não muda em nenhum cenário:** pátio, tarifa, ticket, veículo, vaga,
mensalista, venda, itens, turno, o cálculo do rateio e as telas. É por isso que
1 a 3 e 4a começam sem esperar ninguém.

**Como não ficar refém da resposta**

- Todo efeito financeiro entra por **uma função só**, `pdv_processar_venda_paga`.
  Se o modelo virar, muda uma função e a leitura do ledger — não trinta lugares.
- `pdv_vendas.modelo_recebimento` é gravado **desde a primeira venda**, mesmo
  enquanto só existe um modelo. Saber sob qual regra cada linha antiga foi
  gravada é barato hoje e impagável no dia de uma migração.
- Enquanto o aval não vier, a fase 4a pode rodar em produção sem risco: ela
  calcula e registra, e ninguém saca nada.

**Aval suficiente para destravar a 4b** não é parecer completo: é (i) o Mercado
Pago aceitando o arranjo, (ii) o modelo escolhido, e (iii) a cláusula de
recebimento no contrato de parceiro. Com esses três por escrito, escreve-se o
SQL de carteira.

**E ele não trava só a 4b.** A aprovação comercial formal do modelo precisa
existir **antes da homologação** (fase 6). Construir o SmartApp sem ela é
aceitável; submetê-lo à homologação, não — se o modelo for recusado no meio do
processo, o app volta para a prancheta com a arquitetura de pagamento trocada.
Ordem correta: aprovação comercial → homologação → distribuição.

Se o modelo A não for aprovado, o caminho documentado é o **modelo B**: cada
conta titular autoriza a aplicação por OAuth. Não é o fim do produto — é o
desenho financeiro trocado, com o custo concentrado na 4b e na conciliação.

Os pontos regulatório, contratual, fiscal e contábil não são decisão do Mercado
Pago nem nossa: vão para o jurídico e a contabilidade da FitMind.

---

## 13. O que não depende de código

| Quem | O quê | Prazo |
|---|---|---|
| Erick | **Falar com o comercial do Mercado Pago** sobre SmartApp — nada técnico começa antes | Primeiro item, hoje |
| Erick | Pedir ao consultor um **terminal Point Smart de desenvolvimento** (USB liberado, depuração ativa) | Junto com o item acima |
| Erick / MP | **Validar formalmente o modelo de recebimento** — a FitMind recebendo as vendas dos estabelecimentos parceiros e repassando internamente. O MP respondeu que a documentação **não confirma** isso, nem confirma split para Point presencial: é onboarding comercial, e é o **único bloqueio real** que sobrou | Fase 0, antes de escrever SQL de carteira |
| Erick / MP | Confirmar se os dois APKs entram como **uma aplicação ou duas** | Antes de empacotar, fase 5 |
| Erick | Reunir os **dados cadastrais reais de cada parceiro** (endereço, localização) — loja e caixa exigem endereço verdadeiro, e cada caixa comporta um terminal | Antes do provisionamento em escala |
| Erick | Criar a aplicação **FitMind PDV** no painel de desenvolvedores e gerar credenciais | Antes da fase 3 |
| Erick | Criar loja e caixa, e vincular fisicamente cada Point (ligar, ler QR pelo app do MP, escolher loja/caixa, ativar modo PDV) — **não automatizável** | Antes da fase 3 |
| Mercado Pago | Homologar o APK | Fase 6 |
| Mercado Pago | Confirmação **por escrito** do modelo de N Points na conta FitMind distribuídas em parceiros | Antes de escalar |
| Jurídico/contábil | Receita de terceiros entrando na conta FitMind com repasse posterior deixa de ser decisão de API a partir de certo volume | Antes de escalar |

---

## 14. Decisões ainda em aberto

1. **Venda anônima reusa o motor ou ganha caminho próprio?** Sai da leitura de
   `process_partner_product_order_paid` na Fase 0.
2. **Taxa da Point por modalidade** (débito, crédito, parcelado): coluna nova em
   `taxas_vigentes` ou tabela irmã.
2b. ~~Como o OAuth se aplica ao modelo A?~~ **Respondida em 09/09/2026:** no
   modelo A não há OAuth — credenciais de produção da própria aplicação, Public
   Key no app e Access Token no backend. OAuth só no modelo B, com token no
   servidor e renovação antes de 180 dias.
3. **Quem paga a taxa do parcelamento** — parceiro ou plataforma. Muda o rateio.
4. ~~Kotlin puro ou Kotlin com uma tela WebView?~~ **Fechada em 09/09/2026:**
   WebView é proibido por escrito na homologação. Kotlin nativo, sem alternativa.
   ~~`minSdk` único ou duas variantes?~~ **Também fechada:** duas variantes,
   `minSdk 23` e `minSdk 31`, com módulo comum compartilhado.
5. **Ticket perdido**: existe tarifa de perda? Hoje não modelada.
6. **Quantos terminais por parceiro** — hoje o desenho assume um dispositivo por
   `pdv_dispositivos`, vários por parceiro. Guarita com duas cabines já cria
   disputa pela mesma vaga; resolver antes da fase 9.

---

Quando a produção começar, as decisões e armadilhas desta frente passam a viver
em `docs/contexto/fitmind-pdv-estacionamento.md`. Este documento continua sendo
o desenho.

**Fontes consultadas em 09/09/2026:**
[SmartApps — visão geral](https://www.mercadopago.com.ar/developers/pt/docs/smartapps/overview) ·
[Mercado Pago Point — documentação](https://www.mercadopago.com.br/developers/pt/docs/mp-point/landing) ·
[Tipos de parceria (ISV)](https://www.mercadopago.com.br/blog/tipos-parceria-mercado-pago) ·
[Point Smart 2 — análise](https://www.mercadopago.com.br/blog/analise-completa-point-smart-2)
