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
*gerado*; entrega é `bot_disparo_alvos.status`. O `pg_cron` **não** foi agendado
ainda, de propósito.

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
