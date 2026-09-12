---
name: fitmind-vertical-acesso
description: "Decisões do Erick sobre a vertical de acesso da FitMind: unidade = parceiro, mensalidade de academia é nova, sincronização em vez de cache, bloqueio em D+4"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e4322ed-4790-4527-8909-cd39a08137f1
  modified: 2026-08-13T00:16:52.930Z
---

Decidido em 12/08/2026, depois da prova física da catraca
([[catraca-solution-protocolo]]). Plano completo em
`C:\dev\fitmind-acesso\PLANO-VERTICAL-ACESSO.html`.

**A unidade é o parceiro.** Academias são cadastradas dentro de Parceiros — não
existe nem deve existir tabela `unidades` separada. Uma migration já derrubou
`partners_profile_id_key`, então um mesmo dono tem várias unidades. Eu errei isso
na primeira leitura por procurar `unidade/gym/tenant` em vez de *parceiro*.

**Mensalidade de academia não existe no sistema e é coisa a criar.** As tabelas
`subscriptions`/`subscription_invoices`/`recurring_charges` são o **custo da
plataforma**, não mensalidade de aluno de academia. Não reaproveitar
`end_date`/`valid_until`/`due_date`/`expires_at` para acesso: entra um campo novo
`valido_ate`, chaveado por `(partner_id, student_id)`.

**Invariante inegociável:** a unidade só *monitora* quem frequenta. O aluno
continua sendo do **coach responsável**, que mantém integralmente a comissão das
compras dele. Nenhuma consulta de comissão pode passar pelo vínculo com a
unidade — se passar, o modelo foi quebrado.

**Offline: sincronização, não cache.** Retrato local atualizado ao ligar o PC, ao
abrir o app, no instante em que a internet volta, e por um botão manual
"Sincronizar agora" — este último é obrigatório, é o caso do aluno que acabou de
pagar na recepção.

Outras decisões: bloqueio em **D+4** (libera até o fim do D+3); cada academia só
libera os seus alunos (coprodução entre academias fica para depois); liberação
manual pela recepção existe e **exigir senha é configurável por academia**;
day-use/aula experimental é **caminho separado** com regra por academia (uma vez
na vida, uma vez por mês, livre, desativado).

**Superfícies de teste** vão para uma aba dentro do painel de parceiro, perfil
"teste academia parceiro", nunca na área pública. O Erick nomeou
`erickponcepereira@outlook.com` e `nathan.utuari@gmail.com` — mas a decisão
anterior foi gatear por `profiles.is_master_admin` e não por lista de e-mail
(ver [[fitmind-loja-unificada]]); confirmar antes de implementar.

Interface usa o padrão gráfico que a FitMind já tem, sem identidade nova. O
gancho de white label já existe no banco: `brand_themes` + `partners.brand_theme_key`.

**Tudo tem que ser configurável.** O que a academia solta para o aluno se
configura dentro do parceiro; o perfil da academia, pelo admin.

## Estado em 12/08/2026

Entregue na aba "Academia (teste)" do painel de parceiro, gate duplo
(`is_master_admin` **e** membro/dono da academia). Commits `dbab1c4f`,
`a1608be1`, `5a35c25b`, `2cd62cb1` em `main`.

Existe: `academia_mensalidades` (com `status` e cancelamento que preserva o
histórico), `partner_acesso_config`, `partner_taxas_externas`, `academia_avisos`,
`academia_avisos_modelos`. Régua em `acesso_classificar`, consumida por
`acesso_avaliar` (catraca) e `acesso_avaliar_academia` (tela). Avisos em d3, d2,
d1, d0 e `ultimo_dia` (= `-dias_carencia`), com texto editável por academia.

**Regra que se repetiu três vezes:** toda lógica de negócio mora no banco, uma
vez só. Já houve duplicação da régua em TS e da montagem de campanha — as duas
foram consolidadas em SQL.

**Nada envia sozinho.** `academia_avisos_preparar` monta `bot_disparos` em
rascunho; o envio é o `dispararCampanha` da aba Robô, onde ficam limite diário do
chip, intervalo e deduplicação. `academia_avisos` registra que o aviso foi
*gerado*; entrega é `bot_disparo_alvos.status`. ~~O `pg_cron` não foi agendado
ainda, de propósito.~~ **Desatualizado: em 02/09/2026 havia três jobs ativos —
ver a seção de 02/09 no fim deste arquivo.**

Armadilha: o robô substitui `{nome}` no envio, mas **não** `{data}` — a data é
resolvida na montagem da campanha.

Falta: agendar o cron, day-use, e toda a ponte iDFace → decisão → catraca
(endpoint de decisão, agente local, idempotência em disco, anti-replay).

## 19/08/2026 — o cutover funcionou, e a divergência era relatório

Primeira janela de sombra com alunos reais deu 14 comparações, 10 divergentes,
quase todas "eu negado, ele liberado". **A hipótese de que a academia liberava
vencido por cortesia está descartada.** A lista mestra de clientes do Next Fit
mostra 149 contratos ativos; os relatórios de detalhe por plano trazem só 96.
Os relatórios de plano saem filtrados — não é política frouxa, é fonte
incompleta.

Consequência prática: **faltam 53 pessoas com contrato ativo e sem data de
validade**, e sem data não dá para lançar mensalidade. Enquanto isso não for
resolvido o cutover definitivo barra gente que entra hoje. O relatório a pedir é
contratos sem filtro de período, com **matrícula + telefone + validade** — a
conferência é chegar a 149 ativos, não 96. A matrícula importa porque
`academia_importar_contratos` casa por **nome** (normaliza só caixa e espaço).

O único caso real de gente no leitor sem cadastro no Next Fit é a referência 317.

Reinstalar o agente **cria pareamento novo** e o registro antigo continua ativo
com segredo válido — chegou a haver três "PC da recepcao". Desativados na mão;
o painel ainda não tem botão para isso.

## 25/08/2026 — produção, e a armadilha de RLS no navegador

**A academia mora em `646c99dd` ("Estação Funcional", Várzea Grande/MT), não em
`094db4de` ("[TESTE] Bancada Academia").** Toda a operação foi migrada em 25/08:
408 credenciais, 401 mensalidades, CRM, planos, config, taxas, avisos, agente e
as conexões do robô. A bancada continua existindo com membros, carteira e cursos
próprios — está vazia de academia **de propósito**.

O agente da catraca **não precisou reparear** na migração: ele só conhece
`agenteId` e segredo, e o retrato sai do `partner_id` da linha dele em
`academia_agentes`.

**Armadilha que custou uma ida à academia:** o seletor de perfis consultava
`partner_acesso_config` direto do navegador para decidir se mostrava "Academia".
Isso passa por RLS, e **política que devolve vazio não dá erro** — o item some da
lista sem log nem mensagem. A flag agora vem de `minhas_unidades_parceiro`
(`tem_academia`), que é `SECURITY DEFINER`. Regra geral: decisão de UI que
depende de tabela com RLS vai por RPC `SECURITY DEFINER`, nunca por consulta
direta do cliente.

Duas colunas que colidem com nome de variável em plpgsql e derrubam bloco
inteiro por ambiguidade: `academia_mensalidades.origem` e `partner_id`. Prefixar
com `v_`.

## 25/08 noite — a pessoa existe na nuvem e não existe no leitor

Sintoma: "cadastro novo não aparece na catraca", com mensalidade em dia e
retrato correto. Causa: o cadastro de balcão (`cadastrarPessoaAcademia`, criado
pelo Lovable) cria a credencial **só na nuvem**, com identificador **sorteado**
entre 100000 e 999999, conferido apenas contra credenciais `tipo='pin'` — nem
contra as 408 faciais, nem contra o equipamento.

O leitor não conhece esse id, então **nunca reporta ele**, e a catraca não chega
a ser acionada. Prova: credencial 537364 (Jullya), `importado_em` nulo, zero
fotos na fila, no retrato até 26/09.

Sinal diagnóstico confiável: `academia_credenciais.importado_em IS NULL`
significa "nunca foi vista no equipamento".

Corrigido: identificador passa a sair da faixa 700001+ por max+1 conferindo
contra TODAS as credenciais; e o agente (1.13.00) cria no leitor, a cada
sincronização, quem tem `importado_em` nulo — via
`academia_agente_credenciais_pendentes`.

**Armadilha do Supabase:** função RPC nova só fica visível para o PostgREST
depois de `NOTIFY pgrst, 'reload schema'`. Sem isso o agente chama e leva erro,
sem nada aparecer no banco.

## 31/08/2026 — a conciliação é o gargalo, e ela não acontece sozinha

Medido na Estação: **413 das 414 credenciais ativas não têm `student_id`**. Sem
esse vínculo a pessoa existe para a catraca e **não existe para o aplicativo** —
`academia_meu_qr`, `academia_minhas_academias` e `academia_reservar_aula` todas
partem do aluno. Não é faxina de cadastro: é o que trava QR, reserva e app.

Dessas 413, **só ~26 têm algum candidato** (20 de confiança alta por telefone
idêntico + nome, 3 média, 3 baixa). As outras **~387 não têm com quem casar
porque a pessoa não tem conta na FitMind**. Qualquer tela que mostre só os pares
faz a conciliação parecer quase pronta quando ela mal começou.

**Não existe gatilho que ligue a credencial quando a pessoa se cadastra.** Conferi
todos os triggers de `students` e `profiles`: nenhum toca `academia_credenciais`.
Logo a conciliação é **rotina recorrente**, não mutirão único — depois de cada
leva de cadastros alguém tem que voltar e ligar. Se um dia isso incomodar, o
gatilho seguro é só a faixa 'alta' (telefone único dos dois lados **e** nome
conferindo); telefone sozinho casa família inteira.

A régua de conciliação já existia pronta no banco desde antes
(`academia_credenciais_sugerir_vinculo` + `academia_credencial_vincular`, que
ainda religa mensalidade paga como aluno para a credencial) — estava órfã, sem
tela. Mesma história de `academia_constancia`, `academia_faltas` e
`academia_padrao_do_aluno`. **Antes de escrever régua nova, procurar a função no
banco: neste projeto ela costuma já existir e só faltar quem a chame.**

Constância precisa de **duas semanas completas por pessoa**. Com 5 dias de
catraca, as 410 pessoas da Estação saem todas como 'novo' — está certo, e a tela
tem que dizer isso em voz alta ou parece defeito.

## 31/08/2026 — Reino Muay Thai, e a armadilha do white label

**A unidade a implantar é `af6dd958-950e-4c56-a030-63878ce04028` ("Reino Muay
Thai", Rua Arenapolis, CPA II).** Existe uma segunda, `570afb0e` ("Reino Muay
Thai JR Fitness", Rua São Mateus), mesmo dono e mesmo CNPJ — **as duas ganharam
`partner_acesso_config` por engano**; a JR Fitness continua vazia. Não confundir.

Importadas 59 pessoas do sistema antigo do Jean como `tipo='qrcode'`,
referências 700001–700059 (ele não tem catraca). `academia_importar_contratos`
**não serve aqui**: ela casa por nome contra credencial que já existe, e no Jean
não existia nenhuma. Entrou coluna nova `academia_credenciais.cpf` — a lista
dele tem CPF e não havia onde guardar.

**A lista de clientes do sistema dele NÃO tem data de validade nem plano por
pessoa.** A coluna é "Criado em", que é criação do cadastro. Sem isso não dá
para lançar mensalidade — mesmo buraco de 19/08 na Estação. O relatório a pedir
é o de contratos, com **plano + início + vencimento por aluno**.

**White label:** o tema `reino-muay-thai` estava com `background:#ff0000` e
`primary:#ff5252` — 1,25:1, botão invisível. A causa não é falta de conferência:
`auditarContraste` em `src/lib/palette.ts` já rodava na tela e reprovava **cinco
pares**; ela só avisava, e o save passava. Agora `saveBrandTheme` recusa quando
texto reprova, com escape `ignorar_contraste`.

E `.painel-academia` tinha paleta **fixa**, então white label nenhum chegava no
painel da academia. Agora deriva de `--background/--card/--muted/--border/
--foreground/--primary`. Duas regras que valem manter: **estado não segue a
marca** (verde=em dia, vermelho=bloqueado em qualquer unidade, com variante
`.light` porque o âmbar some no claro), e o texto do botão sai de
`--aca-acao-ink` (= `--primary-foreground`) — fixo em branco, a primária amarela
da Mutação Fit escreveria branco sobre amarelo.

### 31/08 noite — o Reino importado, e a lição do WhatsApp

**Lista colada em WhatsApp vem truncada, e a página final CHEIA não prova nada.**
Aconteceu três vezes seguidas com o mesmo dado: clientes vieram 59, depois 65,
e o arquivo completo tinha **113**; contratos vieram 102 e eram **108** — a
página que faltava era a mais RECENTE, com 6 contratos ativos. Toda vez a última
página tinha 6 de 6 linhas. **Peça o arquivo, não a colagem**, e confira contando
páginas.

Estado final do Reino (`af6dd958`): 113 credenciais `tipo=qrcode` (83 ativas,
103 com CPF), 4 planos, 84 mensalidades — uma por pessoa, a do **último
contrato**. `acesso_avaliar_academia` dá 22 liberados e 62 bloqueados.

**A checagem que provou o conjunto:** as 29 pessoas sem mensalidade nenhuma são
**exatamente** as 29 inativas sem contrato. Nenhum "Ativo" ficou sem plano e
nenhum contrato ficou sem cadastro. Quando os dois lados fecham assim, a
importação está completa — foi isso que faltava nas duas tentativas anteriores.

`valor = 0` em todas, de propósito: o dinheiro entrou no sistema antigo, e
lançar R$ 220 inventaria receita no fluxo de caixa da FitMind. Mesmo critério do
`academia_importar_contratos` (`origem=externa`, `forma_pagamento=outro`);
só o `importado_de` muda, aqui é `sistema-antigo`.

`academia_importar_contratos` **não serve para academia sem catraca**: ela casa
por nome contra credencial que já existe, e no Jean não existia nenhuma. O
caminho foi criar a credencial a partir da própria lista de clientes.

**Nenhum dos 113 tem QR ainda** — zero `student_id`. Sem conciliação a academia
abre com a porta na mão.

## 01/09/2026 — medida a conciliação do Reino: 77 das 83 não têm conta

Números do Reino (`af6dd958`), medidos: 113 credenciais, 83 ativas, **zero com
`student_id`**, 103 com CPF, e **todas as 113 com telefone**. Nenhuma vista no
equipamento — o Jean não tem catraca, então `importado_em` nulo aqui é normal, e
não o sinal de defeito que é na Estação.

A régua `academia_credenciais_sugerir_vinculo` devolve **7 pares para 6
credenciais**: 2 'alta', 3 'media', 2 'baixa' (as duas do mesmo Jean). Ou seja
**77 das 83 ativas não têm candidato nenhum** — mesma proporção da Estação, e
pelo mesmo motivo: a pessoa não tem conta na FitMind. A tela
(`ConciliarCredenciais.tsx`) já existe e já trata `sem_candidato` como número de
primeira classe, então o que falta **não é tela nem régua: é conta**. Conciliar
não abre a porta do Reino; só cadastro abre.

**E ligar essas pessoas é trabalho da academia, não do sistema.** O Erick
concilia na mão conforme cada uma se cadastra, igual ao que já se faz na Estação
Funcional. Então o número alto de "sem candidato" **não é pendência de
desenvolvimento** e não deve voltar como bloqueio a cada sessão: é a fila normal
de uma operação que começou fora do app. O que cabe ao sistema é a régua ser
confiável quando a pessoa finalmente aparecer — por isso o CPF entrou como
desempate.

**O CPF do Reino não salva a conciliação, e vale saber por quê.** Casa apenas
**1** das 83 — não porque falte CPF na credencial (76 das ativas têm), mas
porque `profiles.cpf` está preenchido em só **53 de 479** perfis (11%). Telefone
está em 452 de 479 (94%). Então, para casar, telefone continua sendo a chave
prática e CPF é chave de **desempate**, não de varredura. Quem for propor
"casar por CPF" precisa saber disso antes de investir.

Onde o CPF vale muito: **desempatar**. A credencial "Jean Reis" tem dois alunos
no mesmo telefone e por isso cai em 'baixa' ("confirme quem é"). A credencial
tem CPF `03706027143`, e exatamente uma das duas contas tem esse CPF — a outra
não tem CPF nenhum. O CPF resolve sozinho o que a régua manda o humano resolver.

**Telefone de dígito repetido é falso positivo.** "Davi Martins Pego de
Freitas" casa com "João do Açaí" em `(99) 99999-9999` e sai como **'media'** —
e `academia_credencial_vincular` religa mensalidade paga para a credencial
ligada, então par errado aqui mexe em dinheiro. Só que o problema é pequeno e
contido: em toda a base há **1 perfil e 2 credenciais** com dígito repetido, e
na Estação a única (`consumidor`, `00000000000`) não forma par com ninguém.
Vale blindar como prevenção, não como incêndio.

**A Estação não tem nenhum CPF** (0 de 416), o que torna qualquer regra de CPF
inócua lá por construção. Distribuição atual dela: 21 'alta', 3 'media', 5
'baixa', **nenhum par apoiado em telefone-lixo**. Isso é o que permite mexer na
régua compartilhada sem risco para a Estação — mas confira de novo antes de
mexer, porque no dia em que a Estação ganhar CPF a conta muda.

### 01/09 — CPF vira desempate na régua, e telefone-lixo sai de evidência

Aplicado em `academia_credenciais_sugerir_vinculo`
(`supabase/migrations/20260901230000_cpf_desempata_conciliacao.sql`,
`md5(prosrc)` = `d3b827ea788e7dcfe69e2f64afd65e52`, conferido e batendo de
primeira). Três mudanças, **sem alterar a assinatura nem as colunas de saída** —
`ConciliarCredenciais.tsx` e `academia-conciliacao.functions.ts` seguem valendo
sem tocar em nada.

1. **CPF idêntico e único dos dois lados vale 'alta'**, mesmo quando o telefone é
   ambíguo. É o que resolve o Jean: a régua mandava o humano escolher entre duas
   contas no mesmo número, e o documento já estava no banco decidindo sozinho.
2. **CPF divergente derruba para 'baixa'.** Quando os dois documentos existem e
   são diferentes, não é a mesma pessoa — por mais que telefone e nome combinem.
3. **Telefone de dígito repetido vira NULL** nos dois lados, então não forma par.

Também entrou o CPF no universo de candidatos (antes era só "aluno da unidade"
ou "telefone que a academia já tem"). Continua estreito de propósito: casamento
exato de documento, não varredura da plataforma.

Reino antes: 7 pares / 6 credenciais, 2 'alta'. Depois: 6 pares / 5 credenciais,
3 'alta', e o par Davi ↔ João do Açaí sumiu. A segunda conta do Jean (a sem CPF)
continua aparecendo em 'baixa' — está certo: é candidata de verdade, e cabe ao
humano recusar.

**Estação medida antes e depois: 21 'alta', 3 'media', 5 'baixa' — idêntica.**
Era o resultado esperado (0 CPF em 416 credenciais torna as regras de CPF
inócuas lá), mas foi conferido, não presumido.

### 01/09 noite — a recepção sem catraca, que era o que faltava para o Reino abrir

O Reino não tem catraca e não vai ter tão cedo: a leitura de QR sai do **celular
de quem estiver na recepção**. Um leitor iDFace fica para o futuro. Isso muda o
que é pendência: fila de fotos, rota `/identificar` e a ponte iDFace → decisão →
catraca **não valem nada aqui**.

O que valia era um buraco que ninguém tinha visto. Só **duas** coisas escreviam
`academia_frequencias`: `academia_agente_enviar` (a catraca, que o Reino não tem)
e `academia_qr_validar` (que exige conta no app mais conciliação — hoje ~6 das 83
ativas). Ou seja, a recepção não conseguia fazer as duas coisas que mais importam
onde a porta é humana: **saber se a pessoa está em dia** e **registrar que ela
entrou**. E a constraint da tabela já previa `origem = 'manual'` desde sempre,
com nada escrevendo esse valor — a peça estava desenhada e nunca construída.

Entraram `academia_recepcao_buscar` (nome ou CPF, mínimo três letras, devolve a
situação avaliada e se a pessoa já entrou hoje) e `academia_recepcao_entrada`
(grava a frequência com origem `manual`), mais a busca na tela `RecepcaoQR`.

**Quem está devendo entra, e isso é decisão, não descuido.** Sem catraca a porta
é física: a recepção vai deixar passar de qualquer jeito, e um sistema que finge
ter barrado produz relatório de frequência falso. No Reino de hoje isso seria 62
das 83 pessoas, ou seja o caso comum e não a exceção. Então a entrada é gravada,
a observação da frequência diz que foi liberação de quem estava bloqueado, e a
ocorrência vai para `academia_acessos_negados` com o nome de quem liberou. A tela
pede confirmação antes, dizendo a situação em português.

A janela de 5 minutos é a mesma do QR, pelo mesmo motivo: reconferir a mesma
pessoa é a recepção checando, não alguém treinando duas vezes.

**Provado em transação com ROLLBACK, contra os dados reais do Reino:** três
chamadas (em dia, a mesma de novo, e uma bloqueada há 135 dias) produziram 2
frequências e 1 ocorrência — a repetida devolveu `repetido: true` e não contou
treino em dobro. O `ROLLBACK` devolveu o Reino a 0 e 0. `md5(prosrc)` das duas
funções bate com o corpo da migration.

`validacao_frequencia` do Reino era `'ambos'` (catraca e QR) numa academia sem
catraca; virou `'qrcode'`. Vale saber que **essa chave não é lida por nenhuma
função de decisão** — só pela tela de configuração. É rótulo, não trava; quem for
mexer nela não está mudando comportamento nenhum.

Não exercitei a tela no navegador — o painel exige login. O que foi exercitado de
verdade foram as duas funções do banco, contra os dados reais.

### 01/09 — o Reino trabalha por reserva, e a agenda some onde não há grade

Corrigido: o Reino estava em `regime_turma = 'livre'` e **trabalha por reserva**.
Isso não era só rótulo — `academia_minhas_academias` só oferece o botão de
reservar quando o regime é `reserva`, então com `livre` o aluno nunca veria a
reserva no aplicativo. Agora é `reserva`, com 7 turmas de Muay Thai: 06, 07, 08,
17, 18, 19 e 20 horas, de uma hora cada. **Dias assumidos: segunda a sexta**, pelo
mesmo padrão da Estação — o Erick não disse os dias, e muda na aba Frequência.

Na recepção, a agenda de aulas agora só aparece se a academia tiver grade
(`academia_temGrade` conta as turmas ativas). Sem isso o bloco repetia "cadastre a
grade" para sempre e ocupava meia tela de celular numa academia de treino livre.
A contagem é da grade inteira e não das aulas de hoje, senão num sábado a
academia perderia a navegação para segunda.

### 01/09 — CRM e disparos do Reino: o funil cabe nos avisos, não nas colunas

O funil pedido tem 9 etapas: vencimento próximo (3 dias), dia do vencimento, 2
dias depois do último dia de entrada, 7, 30, 60 e 90 dias, e a lista fria de quem
não voltou. **Descoberta que muda o desenho:** `academia_crm_sincronizar` casa
`gatilho = motivo` de `acesso_avaliar_academia`, e os motivos são só cinco. Quem
venceu há 2 dias e quem venceu há 200 têm o **mesmo motivo**. Ou seja, as etapas
de 7, 30, 60, 90 e fria **não existem como gatilho** e não dá para configurá-las
— só construindo faixas por `dias_restantes`, o que ainda não foi feito.

O que salva o funil é que a régua fina já mora do outro lado.
`academia_avisos_modelos` tem `referencia` (vencimento ou bloqueio) e `quando`
(dias, negativo = depois), `marco` é texto livre — não tem CHECK — e
`academia_avisos_preparar` lê os modelos genericamente. Então a cadência inteira é
**configuração pura**, inclusive um marco que não existia.

Criados para o Reino (`af6dd958`), que estava com **zero** modelos:

| marco | referência | quando | o que é |
|---|---|---|---|
| `d3` | vencimento | +3 | faltam 3 dias |
| `d0` | vencimento | 0 | vence hoje |
| `pos_bloqueio_2` | bloqueio | −2 | dois dias sem acesso |
| `retorno_7` | bloqueio | −7 | chamando de volta |
| `retorno_30` | bloqueio | −30 | remarketing |
| `retorno_60` | bloqueio | −60 | remarketing — **marco novo**, não existia |
| `retorno_90` | bloqueio | −90 | última chamada |

E o quadro `Renovação — Reino Muay Thai`, que também não existia, com as 9 colunas
pedidas mais `Renovou` (tipo `ganho`) — esta eu acrescentei, porque funil sem
coluna de vitória não fecha.

**Só três colunas têm régua automática**, que são os gatilhos que existem:
`vencimento_proximo` → Vencimento próximo, `em_carencia` → Último dia de entrada,
`vencido_bloqueado` → 2 dias sem acesso. "Vence hoje" não tem gatilho próprio (d0
cai dentro de vencimento_proximo), e das etapas de retorno em diante **quem move o
cartão é a recepção**. Isso é coerente com o desenho original: a automação larga o
cartão assim que alguém o move. **As mensagens de 7, 30, 60 e 90 saem sozinhas
pelos avisos** — a coluna é onde a equipe trabalha, não o que dispara.

Provado em transação com ROLLBACK: a sincronização criaria **62 cartões** em "2
dias sem acesso" — exatamente os 62 bloqueados — e zero nas outras duas, porque
hoje ninguém está a vencer nem em carência. O quadro segue vazio de propósito;
quem popula é o botão de sincronizar no painel.

**Ainda desligado:** `avisos_automaticos` e `avisos_envio_automatico` do Reino
seguem `false`, e é o certo até o chip do WhatsApp estar configurado. Ligar antes
enfileiraria disparo sem por onde sair. É o último interruptor, depois do número.

### 02/09 — o funil anda sozinho, e quem paga sai dele

Dois defeitos do mesmo desenho, e o segundo só aparece depois de corrigir o
primeiro.

**Todo mundo bloqueado caía numa coluna só.** A sincronização casava
`gatilho = motivo`, e os motivos são cinco: quem venceu há 2 dias e quem venceu há
200 eram indistinguíveis. Agora `academia_crm_regras` tem `dias_min`/`dias_max`,
contados do **último dia de entrada** (vencimento + carência), e a mesma regra
`vencido_bloqueado` se divide em quantas faixas a academia quiser. **As faixas são
dado, não código** — mudar a cadência é `UPDATE`, não migration.

**Quem pagava só voltava se ninguém tivesse mexido no cartão.** O passo que
arquiva exigia a coluna *exata* da regra. Cartão movido para "60 dias" e pessoa
pagando: ficava preso para sempre. Medido antes de corrigir — das duas pessoas que
pagaram no teste, só voltou a que ninguém tinha movido. E isso seria fatal agora:
com o funil andando, **todo** cartão sai da coluna de origem, então nenhum
pagamento resolveria nada. Agora o arquivamento vale para qualquer coluna
governada pela automação; coluna fora dela continua sendo da equipe.

Faixas do Reino (`vencido_bloqueado`): 2–7, 7–30, 30–60, 60–90, 90–120 e 120+.
**O 120 é inferência minha** — o Erick pediu "90 dias, depois lista fria", e eu
mantive a cadência de 30 dias da faixa anterior. É uma linha de `UPDATE` mudar.

Medido nos 62 bloqueados do Reino: 6 em "Chamando de volta", 6 em "Remarketing",
2 em "60 dias", 1 em "90 dias" e **47 na lista fria** — o que faz sentido para uma
academia que importou lista antiga de clientes. Antes: 62 numa coluna só.

Provado em transação com ROLLBACK: pessoa com cartão em coluna da automação paga →
sai do funil; pessoa cujo cartão a equipe levou para "Renovou" paga → fica, porque
o cartão é da equipe. `md5(prosrc)` das duas funções bate com o corpo da migration.

A Estação **não muda**: as quatro regras dela seguem sem faixa, e regra sem faixa
se comporta exatamente como antes.

### 02/09 — feliz aniversário automático, e o cron já estava agendado

**A memória estava desatualizada num ponto que muda decisão:** o `pg_cron` **já
está agendado** para a academia, e há tempo. São três jobs ativos —
`academia-crm-sincronizar` às 10h e 22h, `academia-avisos-preparar` às 12h e
`academia-avisos-automaticos` de hora em hora. A anotação de 12/08 dizia "o
`pg_cron` não foi agendado ainda, de propósito"; não vale mais. O funil e os
avisos já andam sozinhos — o que faltava era o funil **ter para onde andar**.

O aniversário entrou como um **eixo novo**. Os avisos existentes contam dias a
partir do vencimento ou do bloqueio; aniversário não tem relação com mensalidade.
Virou uma terceira `referencia` em `academia_avisos_modelos` e uma segunda fonte
dentro de `academia_avisos_pendentes` — todo o resto do encanamento (montar
campanha, deduplicar telefone, marcar enviado) é genérico e não mudou.

Duas decisões que valem manter:

- **Quem recebe é toda credencial ativa, pagando ou não.** Cobrança tem a regra de
  `dias_sumido` para não mandar "seu plano venceu" a quem já foi embora, mas
  parabéns não é cobrança — é justamente para quem sumiu que ele tem mais chance
  de trazer de volta.
- **`posicao = 0`, então parabéns ganha de cobrança no mesmo dia.** `pendentes` já
  garante um aviso por pessoa por dia e desempata pela menor posição. Mandar "sua
  mensalidade vence" no aniversário é pior do que atrasar a cobrança em um dia.

`valido_ate` do aniversário é a data do aniversário **deste ano**, o que faz a
deduplicação existente valer por ano sem código novo. E 29/02 tem tratamento
próprio em `academia_aniversario_no_ano`: em ano comum cai em 28/02, senão a
pessoa simplesmente nunca receberia.

**Armadilha que custou uma tentativa:** `academia_avisos_modelos` tinha **duas**
constraints de `referencia`, com nomes diferentes — a original
`academia_aviso_referencia_check` e uma no padrão do Postgres. Derrubar só uma
deixa a outra barrando o valor novo. A migration derruba as duas pelo nome.

**O dado é o gargalo, não o código.** Data de nascimento existe em 8 das 417
credenciais ativas da Estação e em **0 das 83** do Reino — quase todo mundo veio
de importação, e a importação não trouxe nascimento. `profiles.birthdate` está
vazio para essa gente. Telefone, ao contrário, tem em 416 e 83. Ou seja: o canal
funciona e a mensagem sai sozinha, mas hoje ela alcança **8 pessoas**. A cobertura
cresce conforme a recepção editar os cadastros.

### 03/09 — a ficha de cadastro, e de onde cada pessoa veio

A aba de alunos só abria modal para quem tem conta na FitMind, e **essa é a
minoria**: a maioria destas academias veio de importação e só existe na
credencial do leitor. Para elas o nome era texto morto, e o dado que a recepção
precisa consertar — telefone errado, nascimento que a importação não trouxe — não
aparecia em tela nenhuma.

Agora o nome abre para todos, e o que abre é a **ficha de cadastro**: nome,
telefone, nascimento, CPF, identificador no leitor, data do cadastro e origem.
Editar é um botão; salvar pede confirmação, porque telefone é por onde o aviso
sai e trocar sem querer manda a cobrança de uma pessoa para o número de outra. A
ficha completa do coach continua alcançável de dentro dela, para quem tem conta.

**A origem não existia como dado.** `academia_credenciais.importado_em` **não
serve** — ela quer dizer "já foi vista no equipamento", e academia sem catraca
tem isso nulo para sempre. A única marca morava em
`academia_mensalidades.importado_de`, que é da mensalidade e não da pessoa: quem
foi importado sem contrato não tem mensalidade nenhuma (29 das 113 no Reino).

Entrou `importado_de` na credencial, no mesmo vocabulário da mensalidade. O
backfill de quem não tem mensalidade **é inferência, e vale saber disso**:
importação acontece em lote, e o lote aparece no `created_at` com clareza
incomum — a Estação inteira nasceu em 15/08 00:35 (404 no mesmo minuto) e o Reino
em três lotes de 01/09 (59 + 6 + 48 = 113). Cadastro de balcão é um por vez, em
minutos espalhados. Resultado: **Reino 113 de 113 `sistema-antigo`; Estação 408
`nextfit` e 9 de balcão** — números que batem com o que a memória já registrava
das duas migrações.

Duas coisas que os dados mostraram no caminho:

- **As 9 pessoas nativas da Estação têm nascimento; as importadas não.** O
  formulário de balcão sempre pediu a data. Ou seja, o buraco do aniversário é
  100% da importação, e fecha conforme a recepção editar as fichas.
- **3 telefones são divididos por 6 pessoas na Estação.** Isso já existia, e a
  trava de duplicidade da edição só impede *novos* conflitos. Custou um defeito:
  o `maybeSingle()` da checagem estoura quando acha mais de uma linha, então
  entrou `limit(1)` antes dele — senão a recepção levaria erro técnico em vez de
  "este telefone já é de fulano".

Editar a ficha **não toca no perfil da FitMind** de quem tem conta:
`nome_no_equipamento` é como a academia chama a pessoa, e o perfil é dela.

Nota de manutenção: `src/integrations/supabase/types.ts` é gerado, e foi editado à
mão para conhecer a coluna nova (Row, Insert e Update). Quando a Lovable
regenerar, a coluna volta sozinha — se sumir antes disso, é regeneração feita
antes desta migration rodar.

### 03/09 — os interruptores do Reino ligados antes do chip

`avisos_automaticos` e `avisos_envio_automatico` do Reino foram para `true`, com o
WhatsApp dele ainda **desconectado e sem número**. Foi de propósito: o Erick pediu
que nada dependa de alguém lembrar, então no minuto em que o chip conectar tudo
começa sozinho, sem mais nenhum passo no painel.

O custo disso é conhecido e pequeno: até o chip conectar, `academia_avisos_preparar`
monta campanha em rascunho que não sai — e a própria função limpa o rascunho de
outro dia na rodada seguinte, então nada acumula. Ninguém é marcado como tendo
recebido, porque `academia_avisos.enviado_em` só é preenchido no envio: a fila de
quem deve receber fica intacta esperando o número.

Estado das conexões em 03/09: Estação `conectado`, número `65993251805`, limite 50
por dia. Reino com conexão criada ("WhatsApp 1"), `desconectado` e sem número — é
o que o Erick vai configurar na academia.

### 08/09 — o Reino ganhou fluxo de atendimento

O Reino não tinha fluxo nenhum: mesmo com o chip conectado, quem escrevesse para a
academia não receberia resposta. Criado espelhando o da Estação, mesma estrutura de
8 passos e mesmo gatilho `primeira_mensagem`:

`saudacao` (2 opções) → `horarios` (7 opções) → `marcar` (ação `criar_cartao_crm`)
→ `marcado` → `fecho` → `aviso_horario` (ação `fora_do_horario`) → `fim`.
O caminho dos planos entra em `planos` e cai no mesmo `fecho`.

O que **não** foi copiado, porque é da unidade:

- **Horários:** os 7 do Reino (06, 07, 08, 17, 18, 19 e 20h, de uma hora cada),
  contra os 6 da Estação. Por isso 9 opções aqui e 8 lá.
- **Planos, tirados de `academia_planos` e não inventados:** Básico R$ 220,
  Trimestral R$ 610, Quadrimestral R$ 650, Anual R$ 1.600.
- **Janela de funcionamento** do `fora_do_horario`: 05:30 às 21:30, seg a sex, em
  `America/Cuiaba` — a Estação usa 04:30 às 22:00 porque a primeira aula dela é
  às 05h.
- **Texto do agendamento** diz que luva e bandagem a academia empresta na primeira
  aula, coisa que não existe em treino funcional.

Conferido: os dois fluxos com 8 passos, ativos, começando em `saudacao`, e **zero
becos sem saída** (passo que não é `encerrar`, sem próximo e sem opção).

**Corrigido em 08/09, e o conserto tinha três partes, não uma.** O plano chamava-se
`Plano Trimistral`, com erro de digitação. O nome do plano mora em **dois lugares**:
`academia_planos.nome` (o catálogo) e `academia_mensalidades.plano`, que é **texto
copiado na venda**, não chave estrangeira. Renomear só o catálogo deixaria 8
mensalidades ativas dizendo "Trimistral" — divergência em relatório e, pior,
`academia_importar_contratos` casa por **nome**, então uma importação futura não
acharia o plano.

Então foram: o catálogo, as 8 mensalidades (é correção de digitação, não
renomeação de plano vendido — a academia nunca vendeu um "Trimistral"), e o nome
antigo entrou em `apelidos`, para quem digitar a grafia velha continuar casando em
vez de criar plano duplicado. Conferido depois: zero ocorrências como nome em
qualquer academia, uma só em `apelidos`, de propósito.

**A regra que fica:** nome de plano não é chave. Antes de renomear qualquer plano,
procure o texto em `academia_mensalidades.plano` também.

## 09/09/2026 — produto da própria academia passa a liberar mensalidade

Sintoma relatado: em "produtos que liberam", a busca não acha os produtos que a
academia criou. A causa tinha **três camadas**, e consertar só a primeira seria
armadilha — o vínculo ficaria salvo e a compra nunca geraria mensalidade, em
silêncio.

1. **A busca** olhava `products`, o catálogo da plataforma. O que a academia cria
   vive em `partner_products`, outra tabela. O Reino tem 4 produtos lá, a Estação 6.
2. **A chave estrangeira** de `academia_produtos_mensalidade.product_id` aponta
   para `products`. Mesmo achando, salvar quebraria.
3. **O gerador** `academia_mensalidade_gerar` é dirigido por **transação** — lê
   `transactions.product_id`. Produto de parceiro é vendido por
   `partner_product_orders`, esteira separada que nem tem essa coluna.

Por isso `academia_produtos_mensalidade` estava **vazia nas duas academias**: nunca
funcionou para produto de parceiro, e não dava erro nenhum.

**O que entrou:** `partner_product_id` no vínculo, com `product_id` opcional e um
`CHECK` exigindo exatamente uma origem; `partner_order_id` na mensalidade, porque
`transaction_id` tem chave para `transactions` e pedido de parceiro não passa por
lá — sem chave própria não havia como impedir a mesma compra de gerar duas vezes;
e `academia_mensalidade_gerar_pedido`, espelhando a régua da versão de transação
(política de renovação, busca da credencial, limite semanal do plano).

**Gatilho próprio, não emenda no `grant_partner_product_perks`.** Aquela função já
faz carteirinha, tickets e pontos; misturar academia ali faria uma falha de
academia derrubar tudo. O gatilho novo engole a exceção e anota em
`metadata.academia_erro` — **pagamento nunca cai por causa disto**.

**A busca do parceiro é opt-in** (`incluirDoParceiro`). Ela é compartilhada com a
tela de eventos, e `academia_produtos_evento.product_id` continua com chave para
`products`: oferecer produto de parceiro lá deixaria escolher algo que não salva.

Provado em transação com ROLLBACK: compra paga gera mensalidade de 30 dias, valor
199, forma `pix`, **ligada na credencial** (o que faz destravar na porta, e não só
na conta); pedido tocado duas vezes gera **uma** mensalidade; produto sem vínculo
gera **zero**. `md5(prosrc)` das duas funções batendo com a migration.

### O que ainda falta para funcionar de verdade no Reino

**Nenhuma das 83 credenciais do Reino tem `student_id`.** A compra gera a
mensalidade ligada ao aluno, mas quem avalia a porta é a credencial. Enquanto a
conciliação não acontecer, comprar não destrava ninguém — é a mesma dependência de
sempre, e o motivo de a conciliação ser rotina e não mutirão.

**Preços da loja e planos da academia não batem:** Mensalidade R$ 199 contra Básico
R$ 220, Trimestral R$ 547 contra R$ 610, Anual R$ 1.650 contra R$ 1.600. E dois
produtos estão com status `pending`, não aprovados.

**`types.ts` foi editado à mão** para conhecer as colunas novas. Ele é gerado do
banco; a próxima geração pela Lovable substitui, e tudo bem — mas se aparecer erro
de "coluna não existe no tipo" depois de mexer no banco, é isto.

## 12/09/2026 — cortesia aparece no relatório

**Cortesia é mensalidade lançada por aqui com valor zero** — o plano "gratuito" ou a
renovação marcada como cortesia (`RenovarAluno`). Não tem bandeira no banco:
`academia_renovar` não recebe `cortesia`, grava `forma_pagamento = 'outro'` e não
cria linha em `academia_mensalidade_pagamentos`. O critério é `valor = 0` com
`importado_de IS NULL` — importação do Next Fit também tem valor zero e **não** é
cortesia.

Antes, o relatório contava a cortesia como **venda** ("82 vendas no balcão"),
ela sumia da tabela por forma de pagamento (que lê a tabela de pagamentos) e as
listas mostravam "R$ 0,00 · outro". Agora (`20260912160000`): `financeiro.cortesias`
separa "N vendas · M cortesias"; `por_forma` ganha a linha `cortesia` com `qtd`;
`academia_relatorio_pessoas_extra` com `forma` + filtro `cortesia` lista quem
ganhou, e recebido/renovações/plano escrevem "cortesia".

**`cortesia` não entra em `FORMAS_PAGAMENTO`.** Aquela lista alimenta o seletor de
pagamento da venda e a configuração de taxas; o rótulo mora só no relatório. E
cuidado com o nome: `cortesia` também é um dos `TIPOS_DAYUSE` (`academia_dayuse.tipo`),
que é outra coisa — acesso avulso, não mensalidade.

Na data havia 4 cortesias, todas da Estação e de agosto (2 no "gratuito" e 2
lançamentos avulsos de valor zero, um deles marcado "testando"); nenhuma em setembro,
então o mês corrente não mostra a linha.

**Como foi conferido, e vale repetir:** antes de aplicar, as funções novas foram
criadas em `pg_temp` na mesma chamada do MCP e comparadas linha a linha com as de
`public` (`regexp_split_to_table` + `EXCEPT ALL` nos dois sentidos) — o diff mostrou
só o planejado. Depois de aplicar, cada categoria das listas foi comparada por md5
com uma fotografia tirada antes: as que não tratam de cortesia saíram idênticas.
