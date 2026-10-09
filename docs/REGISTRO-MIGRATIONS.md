## 20261009120000_carteirinha_de_parceiro_exige_estar_em_dia.sql

| | |
|---|---|
| **Autor** | Chat da carteirinha ativa sem pagamento |
| **Data** | 09/10/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | **Sim, indiretamente** — tira o beneficio gratuito de 16 inadimplentes |
| **Aplicada em producao?** | **Sim — 09/10/2026**, `md5(prosrc)` das 5 funcoes conferido |

A carteirinha da Claudia Vilma Bugs estava ativa sem compra nenhuma e com a
mensalidade bloqueada em setembro e outubro. O `card_valid_until` dela e nulo:
quem segurava a carteirinha era `student_has_partner_benefits`, que so olhava
"existe unidade aprovada com produto ativo em students.partner_id" e **nao
olhava pagamento**. Como `partner_id` tambem aponta para a propria unidade de
quem e dono dela, todo parceiro virou portador vitalicio.

Alem disso, **o resgate nao era verificado no servidor**: `requireCard()` so
existe na tela, e as tres funcoes de resgate (cupom de parceiro, cupom de
profissional, brinde FitMind) nunca perguntaram pela carteirinha.

Cria `student_card_ativa(aluno)` com a regra num lugar so (dia comprado **ou**
beneficio de parceiro em dia) e chama ela nas tres. `student_has_partner_benefits`
passa a exigir `NOT is_user_blocked_by_subscription(user_id)` e a ignorar
produto com `deleted_at`.

Efeito medido: de 26 que viviam so do beneficio, **16 perderam a carteirinha**
(os bloqueados) e **10 continuaram** (os que pagam). Voltam sozinhos ao pagar.

**Fica em aberto:** 88 cupons `active` de gente sem carteirinha hoje continuam
resgataveis - `partner_redeem_coupon` valida parceiro, token, status e horario,
nunca a carteirinha. E se o beneficio deve valer para o dono da unidade ou so
para colaborador e decisao de negocio: hoje vale para os dois, em dia.

---

## 20261005120000_avaliacao_importada_duas_vezes.sql

| | |
|---|---|
| **Autor** | Chat de cadastro duplicado |
| **Data** | 05/10/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 05/10/2026**, conferida por consulta |

Apaga **6.370 copias exatas** de avaliacao fisica em 3.105 fichas, sobra de duas
importacoes que rodaram duas vezes: a reimportacao da Ana Flavia em 28/05/2026
(1.753 linhas) e a do Nathan em 06/07/2026, que gravou tudo em dobro no mesmo
dia (4.614 linhas). De 22.575 avaliacoes para 16.205.

Copia exata = linha identica campo a campo a outra, ignorando `id`,
`created_at` e `updated_at`. Fica uma de cada, preferindo a que tem link
publico; linha com link nunca e apagada.

**Nao toca** em duas coisas que tambem apareciam agrupadas: 782 pares com a
mesma data e medida diferente (sao duas pesagens de verdade) e as 9.336 linhas
do Lucinei criadas em 28/05/2026, em que o importador carimbou a data da
importacao em todas — e data perdida, nao copia.

Depois: zero copia exata na base, nenhuma ficha sem avaliacao, nenhum
`/resultado/` quebrado. Os 8 links publicos orfaos que existem sao anteriores,
todos de avaliacao que o proprio coach apagou — o fluxo de exclusao do coach
nao limpa `assessment_shares`. Detalhes em
`docs/contexto/fitmind-avaliacoes-importadas.md`.

Retrato do antes em `backup.avaliacoes_duplicadas_20261005` (6.370 linhas, a
linha inteira em `to_jsonb`).

---

## 20261003130000_emmily_ventura_as_avaliacoes_dela.sql

| | |
|---|---|
| **Autor** | Chat de cadastro duplicado |
| **Data** | 03/10/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 03/10/2026**, conferida por consulta |

Liga as tres avaliacoes de 2024/2025 da Emmily (ficha "Emmily Costa Ventura",
aberta na mao pela Ana Flavia em 18/05/2026, solta de qualquer login) a ficha do
login dela, leva a altura 155 junto, apaga as tres copias identicas da
reimportacao de 28/05/2026 e remove a ficha antiga, ja vazia. A coach deixa de
ver duas Emmilys e a Emmily passa a ver as proprias avaliacoes.

Retrato do antes em `auditoria.emmily_ventura_avaliacoes_20261003` (8 linhas).

**Fica em aberto:** a reimportacao de 28/05 atingiu **3.683 clientes de 4
coaches** — 9.669 linhas sobrando, 6.347 pares identicos campo a campo. So as
tres da Emmily foram limpas.

---

## 20261003120000_emmily_ventura_um_cadastro_so.sql

| | |
|---|---|
| **Autor** | Chat de cadastro duplicado |
| **Data** | 03/10/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | **Sim** — cancela a mensalidade duplicada de R$ 100 e tres faturas (R$ 300 em aberto) |
| **Aplicada em producao?** | **Sim — 03/10/2026**, conferida por consulta |

Unifica os dois cadastros da Emmily Ventura (icloud 12:54 e gmail 12:59 de
19/08/2026) no do gmail, que e o mais recente e o unico com historia. Usa a
`admin_merge_profiles` que ja existia, em `dry_run` antes. Leva o ramo de
atividade, que so existia na duplicada.

Depois da unificacao devolve a **unidade duplicada** para o perfil morto e a
bloqueia: a funcao traz a unidade da origem para o perfil que fica, e como o app
escolhe a unidade aprovada **mais antiga**, a vazia esconderia a de verdade (dois
produtos, 16 cupons, uma colaboradora). Apaga tambem dois retratos de carreira
zerados que ficaram com coach de um lado e perfil do outro.

Retrato do antes em `auditoria.emmily_ventura_20261003` (48 linhas).

---

## 20260924200000_cada_academia_manda_pelo_proprio_numero.sql

| | |
|---|---|
| **Autor** | Chat do robo/WhatsApp |
| **Data** | 24/09/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 24/09/2026**, `md5(prosrc)` conferido (`958a5808...`) |

`bot_escolher_conexao` passa a ordenar pelo numero da propria academia antes do
numero do grupo. Antes, com duas conexoes de prioridade igual, o desempate por
"quem enviou menos hoje" entregava a campanha de uma academia ao chip da outra:
simulado com o numero da Jessica ligado, a campanha da Estacao sairia pelo
WhatsApp dela. O numero do grupo continua como reserva quando o proprio esta
fora do ar.

---

## 20260917230000_nutricionista_recebe_na_carteira_dela.sql

| | |
|---|---|
| **Autor** | Chat de financeiro/nutricionista |
| **Data** | 17/09/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | **Sim** — registra R$ 94,00 pagos ao Helton por Pix, fora do sistema |
| **Aplicada em producao?** | **Sim — 17/09/2026**, `md5(prosrc)` das 2 funcoes conferido |

`pay_nutritionist_available` para de gravar `withdrawal_requests` (o pagamento de
nutricionista virava "pago a mais" na carteira de coach da mesma pessoa, porque o
ledger nao conhece ganho de nutricionista). `recalc_nutritionist_wallets` passa a
contar `paid` e a recalcular o sacado a partir dos lancamentos, e fica so com
`service_role` (estava aberta para anon).

Dados: a fatia de nutricionista da venda FM-D77E7F0E (R$ 94,00) sai do sistema e
vai para o Helton Matos Fernandes, ja paga. Carteira de coach dele conferida antes
e depois: igual. Definicoes antigas em `auditoria.funcoes_nutricionista_20260917`.

---

## 20260917120000_fitmind_volta_e_ocultar_por_categoria.sql

| | |
|---|---|
| **Autor** | Chat de loja/curadoria |
| **Data** | 17/09/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 17/09/2026**, conferida por simulacao de RLS (coach esconde, aluno da rede herda) |

Tres coisas, as tres de dados/constraint (nenhuma funcao mudou):

1. Remove as duas ocultacoes `vendor_fitmind` de pe — Nathan Utuari (15/09, topo
   da rede, 571 alunos) e Tatiane (30/08, dentro da rede dele) —, feitas por um
   toque sem confirmacao no cartao do topo da loja nova. Copia em
   `auditoria.ocultacoes_fitmind_20260917`, com o INSERT de volta comentado na
   migration.
2. Os 56 espelhos Herbalife da Arlete (12/09) saem da secao/categoria
   desativadas (`...0002`) para as canonicas (`...0001`). Copia em
   `auditoria.herbalife_espelho_20260917`.
3. O CHECK de `coach_store_hidden_items.target_type` passa a aceitar
   `'category'`. Antes, esconder categoria dava erro de constraint.

---

## 20260915170000_grupo_vale_para_o_agente_inteiro.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 14/09/2026, 23h de Cuiaba (academia fechada) |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao — as 10 mensalidades movidas eram importadas, R$ 0 |
| **Aplicada em producao?** | **Sim — 14/09/2026**, `md5(prosrc)` das 11 funcoes conferido |

Nove funcoes do agente da catraca passam a olhar o grupo (Estacao + Jessica):
`enviar`, `credenciais_importar`, `credenciais_pendentes`, `faces_a_enviar`,
`face_enviada_confirmar`, `marcar_rostos`, `pessoas`, `credencial_desligar`,
`credencial_editar`. Nova `academia_credencial_no_grupo` (auxiliar) e
`academia_transferir_credenciais` (transferencia com historico). As duas novas
sem EXECUTE para anon/authenticated.

Depois das funcoes, transferidas 10 alunas da Estacao para a Jessica (lista e
ids no fim da migration): 10 credenciais, 10 mensalidades, 24 frequencias, 14
barradas, 4 avisos, 10 cartoes arquivados no funil da Estacao com nota. O
retrato do leitor saiu identico (416 pessoas, md5 `c774819e…` antes e depois).

**Backup das 9 definicoes antigas** em `public._backup_agente_20260915` (RLS
ligada, sem grant). Apagar depois que a catraca da Estacao registrar passagens
normais com as funcoes novas.

---

## 20260912160000_cortesia_aparece_no_relatorio.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 12/09/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao — so leitura de relatorio |
| **Aplicada em producao?** | **Sim — 12/09/2026**, `md5(prosrc)` das duas funcoes conferido |

Reescreve `academia_relatorio` e `academia_relatorio_pessoas_extra` a partir da
definicao que estava em producao (nao da ultima migration do repo). Cortesia —
mensalidade nao importada com valor zero — deixa de contar como venda
(`financeiro.cortesias`), ganha linha propria em `por_forma` (com `qtd`, que todas
as linhas passam a trazer) e lista propria (`forma` + filtro `cortesia`). As listas
de recebido, renovacoes e plano escrevem "cortesia" no lugar de "R$ 0,00 · forma".

Compativel com a tela anterior: os campos novos sao aditivos, e a linha `cortesia`
aparece com o nome cru e R$ 0,00 ate a tela nova subir.

---

## 20260912100000_pdv_patio_operacao.sql

| | |
|---|---|
| **Autor** | Chat do PDV de estacionamento |
| **Data** | 12/09/2026 |
| **Branch** | `main` (clone C:\dev\fitmind-bugs) |
| **Toca em dinheiro?** | Nao — so leitura |
| **Aplicada em producao?** | **Nao** |

Fase 2 do PDV, parte que nao toca dinheiro. Tres funcoes de operacao do patio:
`pdv_patio` (lista com tempo e valor ja resolvidos), `pdv_abrir_ticket` (acha ou
cria o veiculo e abre o ticket numa chamada so) e `pdv_veiculo_resumo` (historico
curto do carro).

**Nao cria tabela nem coluna.** Nenhuma venda, pagamento, turno ou lancamento
financeiro — isso e o resto da fase 2 e fica para depois do aval. O valor que
`pdv_patio` devolve e leitura da regua da fase 1, calculada no banco de proposito:
se a tela somasse fracoes por conta propria existiriam duas reguas, a que cobra e
a que o cliente le.

**Depende de 20260909120000_pdv_patio_e_tarifa.sql**, que ainda nao foi aplicada.
Aplicar as duas na ordem.

---

## 20260909120000_pdv_patio_e_tarifa.sql

| | |
|---|---|
| **Autor** | Chat do PDV de estacionamento |
| **Data** | 09/09/2026 |
| **Branch** | `main` (clone `C:\dev\fitmind-bugs`) |
| **Toca em dinheiro?** | **Parcialmente — precisa do aval do financeiro antes de aplicar** |
| **Aplicada em producao?** | **Nao** |

Fase 1 do PDV: `pdv_vagas`, `pdv_tarifas`, `pdv_veiculos`, `pdv_tickets`, mais
`pdv_normalizar_placa`, `pdv_timezone`, `pdv_tarifa_para`, `pdv_valor_fracoes`,
`pdv_valor_tarifa` e `pdv_calcular_tarifa`. Desenho em `PDV-ESTACIONAMENTO.md`.

**Por que "parcialmente".** Nao encosta em carteira, comissao, fatura, taxa nem
em nenhuma tabela do motor financeiro — nao chama `process_partner_product_order_paid`
e nao credita ninguem. Mas **cria colunas de valor** (`primeira_fracao_valor`,
`teto_periodo_valor`, `valor_fixo`, `pdv_tickets.valor_calculado`) e define o
preco cobrado do cliente final. Pela regra deste arquivo, isso pede aviso ao
chat financeiro **antes** de aplicar, nao depois.

**Protecao de relogio (12/09/2026):** um gatilho normaliza `saida_em` para
`entrada_em` quando a saida vem antes da entrada. Sem isso o CHECK barraria o
UPDATE e o carro ficaria preso no patio — o iDFace deste projeto ja chegou com
quatro horas de atraso, entao relogio de dispositivo errado nao e hipotese.

**Duas permissoes novas esperadas em `partner_members.permissoes`:**
`pdv.operar` (tickets e veiculos, o dia a dia) e `pdv.configurar` (vagas e
tarifas). A separacao e proposital: quem opera a guarita nao muda o preco.

**Verificacao:** `docs/propostas/2026-09-09-pdv-fase1-testes.sql`. A parte A e
pura e pode rodar em producao; a parte B cria e desfaz dados em transacao com
ROLLBACK e precisa de um `partner_id` de teste; a parte C e manual, pelo app,
para provar a RLS com dois parceiros.

A regua aritmetica foi provada fora do banco em 09/09/2026 (14 casos de borda:
tolerancia exata, fracao comecada, teto por periodo de 24h, multiplos dias,
regra fixa e relogio invertido). Isso prova a conta, **nao** o SQL — a maquina
de desenvolvimento nao tem Postgres nem Docker.

---

## 20260805140000_bot_v2.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 05/08/2026 |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 05/08/2026** |

Rotacao de numeros de WhatsApp (prioridade, limite diario por chip, bloqueio),
verificacao invertida por WhatsApp, disparos, e vinculo automatico da conversa
com o funil do CRM.

Conferido pela API REST (fonte confiavel; o texto do editor do Lovable engana):
6 tabelas e 8 funcoes respondendo.

**Nova permissao esperada em partner_members.permissoes:** `robo`.

### Armadilha do editor que voltou a aparecer

O botao Limpar nao funciona com dialogo aberto, e a colagem seguinte CONCATENA
em vez de substituir. A solucao que funcionou: clicar no editor e usar Ctrl+A
e Delete pelo teclado real. O botao tambem muda de nome conforme o idioma da
interface (Run / Executar / Correr).

---

# Registro de migrations fora do chat financeiro

O chat financeiro é o dono de `supabase/migrations/`. Este arquivo registra as
exceções autorizadas: migrations **que não tocam em dinheiro**, escritas por
outros chats, para que o financeiro saiba o que entrou sem precisar auditar o
diretório inteiro.

Regra combinada: migration sem dinheiro pode ser escrita fora do financeiro,
desde que (1) o chat financeiro seja avisado e (2) entre nesta tabela.

Nunca entram aqui: DDL sobre carteiras, comissões, faturas, assinaturas,
pagamentos, taxas, ou qualquer coluna de valor (`cost`, `commission_*`,
`tax_percentage`, `app_fee`, `coupon_code`). Isso continua exclusivo do
financeiro.

---

## 20260731210000_bot_infra.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 31/07/2026 |
| **Branch** | `main` (clone `C:\dev\fitmind-bugs`) |
| **Toca em dinheiro?** | Não |
| **Aplicada em produção?** | **Sim — 04/08/2026**, pelo editor SQL do Lovable |

### Conferência pós-aplicação (04/08/2026)

Verificado pela API REST do Supabase, que é a fonte confiável (o texto do editor
do Lovable engana — ver notas abaixo):

| item | estado |
|---|---|
| `bot_conexoes`, `bot_fluxos`, `bot_passos`, `bot_opcoes`, `bot_conversas`, `bot_mensagens` | todas existem |
| coluna `bot_mensagens.status` (fila de saída) | ok |
| `bot_acesso_dono`, `bot_acesso_conexao`, `bot_clonar_fluxo` | existem |
| 6 tabelas com RLS, 12 políticas | confirmado por consulta |
| gatilhos | o lote aplicou com "Query succeeded" e colagem limpa (1307 de 1306 caracteres), mas **não foi possível reconfirmar por consulta** — o editor entrou em laço de diálogo. Confirmar rodando: `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname LIKE 'bot%'` — esperado 5 |

### Armadilhas do editor SQL do Lovable (custaram tempo nas duas migrations)

1. **Falso positivo de "operação destrutiva".** Ele acusa qualquer SQL que
   contenha as palavras DELETE, UPDATE ou ALTER — inclusive quando é só o nome
   do privilégio em `GRANT SELECT, INSERT, UPDATE, DELETE`.
2. **O diálogo bloqueia o botão Clear.** Com ele aberto, a colagem seguinte
   **concatena** em vez de substituir, e o SQL sai corrompido. Sempre conferir
   se o tamanho colado bate com o esperado antes de executar.
3. **O editor guarda o conteúdo entre sessões.** Recarregar a página não limpa.
4. **"Query succeeded" na tela não prova nada** quando houve concatenação.
   Verificar sempre pela API REST (`/rest/v1/rpc/<funcao>`: 404 = não existe;
   401 = existe e negou para anon, que é o esperado).
5. **A interface alterna entre inglês e português** no meio da sessão — os
   botões viram "Executar", "Limpar", "Corra de qualquer maneira".

### O que cria

Robô de atendimento por WhatsApp, na mesma arquitetura do CRM: ancorado em
`(escopo, owner_id)`, com fluxos clonáveis entre painéis.

Tabelas: `bot_conexoes`, `bot_fluxos`, `bot_passos`, `bot_opcoes`,
`bot_conversas`, `bot_mensagens`.

Funções: `bot_acesso_dono(text, uuid)`, `bot_acesso_fluxo(uuid)`,
`bot_acesso_conexao(uuid)`, `bot_marcar_ultima_mensagem()`,
`bot_clonar_fluxo(uuid, text, uuid, text)`.

**Permissão nova esperada em `partner_members.permissoes`:** `robo`.

### Por que não é financeira

Nenhuma tabela de dinheiro é lida ou alterada. As únicas chaves estrangeiras
para fora do robô são `profiles` e `crm_cartoes`, e nenhuma delas é modificada.

### Decisões que valem registro

**A conversa aponta para um cartão do CRM** (`bot_conversas.cartao_id`). O que o
robô descobre vira lead no funil sem digitação manual.

**Credenciais do WhatsApp não ficam no banco.** A sessão vive no conector, na
máquina da academia. Aqui só existe estado de conexão e `webhook_segredo`, que o
conector usa para provar que a chamada é dele.

**Fila de saída em vez de chamada direta.** O conector roda no PC da academia,
atrás de NAT e sem IP fixo — a nuvem não alcança ele. Então mensagens de saída
nascem com `status = 'pendente'` e o conector *busca* a fila. Uma constraint
garante que mensagem de entrada nunca entre nessa fila por engano.

**`chave` é o identificador estável do passo dentro do fluxo.** É por ela que a
clonagem religa os ponteiros no destino, em vez de mapear UUID a UUID.

**Clone nasce desativado** (`ativo = false`), para ninguém publicar um
atendimento sem revisar.

### Validação feita antes de subir

PostgreSQL 16, banco recriado do zero com stubs + CRM + robô:

- aplicada duas vezes seguidas sem erro (idempotente)
- 6 tabelas com RLS, 12 políticas, 5 funções, 5 gatilhos
- academia B não vê fluxo, conversa nem mensagem da academia A
- funcionário sem a permissão `robo` não vê nada
- webhook repetido não duplica mensagem (índice único em `wa_id`)
- ciclo completo da fila: enfileira, conector busca, confirma envio, fila esvazia
- clonagem religa ponteiros dentro do clone, sem vazar para o fluxo de origem
- clonagem de fluxo alheio é bloqueada

**Dois bugs que a validação pegou:** `gen_random_bytes` exige a extensão
pgcrypto (trocado por `gen_random_uuid`, nativo), e um `UPDATE` referenciava o
alias do alvo dentro do `JOIN` do `FROM`, o que o Postgres recusa.

### Pendências

- [ ] Aplicar em produção
- [ ] Endpoints do app para o conector (webhook de entrada, fila de saída, status)
- [ ] Conector para o PC da academia
- [ ] Interface de fluxos e caixa de entrada

---

## 20260730190000_crm_infra.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 30/07/2026 |
| **Branch** | `feat/bugs` (clone `C:\dev\fitmind-bugs`) |
| **Toca em dinheiro?** | Não |
| **Aplicada em produção?** | **Sim — 30/07/2026**, pelo editor SQL do Lovable |

### O que cria

Motor de quadros estilo Trello, genérico e reaproveitável por qualquer painel.

Tabelas: `crm_quadros`, `crm_colunas`, `crm_etiquetas`, `crm_cartoes`,
`crm_cartao_etiquetas`, `crm_atividades`.

Funções: `crm_acesso_quadro(uuid)`, `crm_clonar_quadro(uuid, text, uuid, text)`,
`crm_touch_updated_at()`, `crm_registrar_mudanca_coluna()`.

### Por que não é financeira

Nenhuma tabela de dinheiro é lida ou alterada. O cartão do CRM referencia
`leads` e `profiles`, e nada mais. Não há valor, comissão, fatura nem carteira
em lugar nenhum do schema. Se o CRM um dia precisar mostrar o valor de um plano,
isso vira leitura via view/RPC do financeiro — não coluna nova aqui.

### Tabelas existentes que ela referencia (só como chave estrangeira)

- `public.profiles` — criador, responsável, dono de quadro de coach/profissional
- `public.leads` — vínculo opcional do cartão com um lead já cadastrado

Não altera nenhuma delas.

### Como o acesso funciona

Tudo passa por `crm_acesso_quadro(quadro_id)`, e as políticas só chamam essa
função. O quadro é ancorado em `(escopo, owner_id)`:

| escopo | quem enxerga |
|---|---|
| `parceiro` | `partner_pode(owner_id, 'crm')` — dono, quem tem a permissão `crm`, ou admin |
| `coach` | o profile dono é o usuário logado |
| `profissional` | o profile dono é o usuário logado |
| `admin` | `is_admin(auth.uid())` |

Reusa os helpers que já existiam (`partner_pode`, `is_admin`) em vez de criar
regra paralela. Segue a convenção do projeto: `auth.uid()` bate em
`profiles.user_id`, nunca em `profiles.id`.

**Permissão nova esperada em `partner_members.permissoes`:** `crm`. Quem for
`owner` do parceiro já passa sem precisar dela.

### Clonagem entre painéis

`crm_clonar_quadro(origem, escopo, owner_id, nome)` copia **estrutura**
(colunas + etiquetas), nunca cartões — dado de uma academia não entra na outra.
Quadros com `modelo = true` são visíveis a todos e servem de ponto de partida;
os demais só clonam com acesso à origem.

### Validação feita antes de subir

Rodada em PostgreSQL 16 local, com stubs de `profiles`, `partners`,
`partner_members`, `leads`, `is_admin` e `partner_pode`:

- aplicada duas vezes seguidas sem erro (idempotente)
- gatilho de mudança de etapa grava na linha do tempo
- `updated_at` se atualiza sozinho
- academia A não enxerga quadro, cartão nem consegue escrever na academia B
- funcionário sem a permissão `crm` não vê nada, mesmo sendo da academia
- clonagem entre painéis funciona; clonagem de quadro alheio é bloqueada

**Achado que essa validação pegou:** o projeto não recebe acesso automático ao
schema `public`. Sem `GRANT ... TO authenticated` explícito por tabela, o app
levaria `permission denied` mesmo com o RLS correto. As 6 tabelas já saem com o
grant.

### Pendências

- [x] Aplicar em produção — feito em 30/07/2026
- [ ] Regenerar `src/integrations/supabase/types.ts` (as telas usam cliente
      destipado enquanto isso; depois dá para trocar por acesso tipado)
- [ ] Conferir/remover a linha de teste de fumaça (ver abaixo)
- [ ] Interface do parceiro (hoje o CRM só está no painel admin)

### Conferência pós-aplicação (produção)

Rodado no editor SQL após aplicar:

| item | esperado | encontrado |
|---|---|---|
| tabelas com RLS | 6 | 6 |
| políticas | 9 | 9 |
| funções | 4 | 4 |
| gatilhos | 4 | 4 |

Teste de fumaça em produção: criado um quadro, movido um cartão de etapa, e o
gatilho gravou a atividade `mudanca_coluna` corretamente (1 registro).

**Ponto em aberto:** o quadro de teste chamado `ZZZ teste de fumaca`
(`escopo='admin'`, `modelo=true`) foi apagado com um DELETE confirmado no
editor, mas a interface do Lovable ficou instável e não deu para ler o retorno
final. Ele não aparece em nenhuma tela atual (a página admin filtra
`escopo='parceiro'`), então não atrapalha o uso. Para confirmar e limpar:

```sql
SELECT id, nome, escopo, modelo FROM public.crm_quadros WHERE nome LIKE 'ZZZ%';
DELETE FROM public.crm_quadros WHERE nome LIKE 'ZZZ%';
```

Observação sobre o `updated_at`: no teste ele saiu igual ao `created_at` porque
o editor roda tudo numa transação só e `now()` devolve o horário de início da
transação. Não é defeito — no teste local, com comandos em transações
separadas, o gatilho atualizou corretamente.

Observação sobre o editor do Lovable: ele acusa "operação destrutiva" quando o
SQL contém a palavra DELETE, mesmo que seja só o privilégio em
`GRANT SELECT, INSERT, UPDATE, DELETE`. É falso positivo.


---

## 20260804120000_crm_v2.sql

| | |
|---|---|
| **Autor** | Chat de acesso/academias |
| **Data** | 04/08/2026 |
| **Toca em dinheiro?** | Nao |
| **Aplicada em producao?** | **Sim — 04/08/2026** |

Separa funil de quadro (coluna `tipo`), adiciona `crm_cartoes.origem`, e cria
`crm_criar_quadro` e `crm_importar_contatos`. Confirmado pela API REST: as duas
funcoes existem e as duas colunas respondem.

Corrige tambem `src/lib/admin-crm.functions.ts`, que usava `.maybeSingle()` para
buscar o quadro do dono — isso quebraria assim que existisse um segundo funil.
