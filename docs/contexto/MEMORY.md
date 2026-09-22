# Contexto do projeto

O que uma sessão nova precisa saber e **não dá para descobrir lendo o código**:
decisões e o porquê delas, armadilhas que já custaram tempo, e o estado real de
cada frente.

Isto morava na memória local do assistente (`~/.claude/projects/.../memory/`),
presa a **uma** máquina. Veio para o repo em 01/09/2026 para acompanhar o clone
— trabalhar de dois computadores não pode depender de copiar pasta.

## Como usar

Não leia tudo. O arquivo certo é o da frente em que você vai mexer — cada um é
curto e fecha um assunto. O `CLAUDE.md` na raiz continua sendo o que carrega
sozinho a cada turno; aqui é o que se consulta sob demanda.

**Ao aprender algo que valeria para a próxima sessão, edite o arquivo da frente
correspondente e commite junto com o código.** Contexto que não é versionado
volta a ficar preso numa máquina.

## Os arquivos

### Como se trabalha
- [Como trabalhar no FitMind](fitmind-como-trabalhar.md) — os dois caminhos de escrita,
  a disciplina do md5, como subir o app local, e onde ficam os documentos de contexto

### Arquitetura
- [Arquitetura do ecossistema](fitmind-arquitetura-ecossistema.md) — quais pastas são o
  mesmo repo, o que já existe no banco, e o padrão do agente que roda no PC da academia
- [AG Kit — skills globais](ag-kit-skills-globais.md) — as skills de `~/.claude/skills`,
  as que estão desligadas, e por que nunca rodar `ag-kit init` sem `--path`
- [AG Kit — o segundo PC](ag-kit-segundo-pc.md) — o que a máquina nova instalou, como o clone
  autenticou sem token, e onde as duas máquinas divergem

### Vertical de acesso e catraca
- [Vertical de acesso](fitmind-vertical-acesso.md) — **o arquivo mais denso.** Unidade é o
  parceiro, mensalidade de academia é coisa nova, bloqueio em D+4, e o histórico de cada
  cutover: Estação, Reino Muay Thai, conciliação e white label
- [Agente da catraca](fitmind-agente-catraca.md) — o programa do PC da academia: pareamento
  por código, e a regra de ser mínimo e sem dados sensíveis
- [Protocolo da catraca](catraca-solution-protocolo.md) — driver aprovado no hardware em
  12/08/2026 e onde está a prova canônica
- [Leitor iDFace](fitmind-leitor-idface.md) — o equipamento real: match booleano, relógio
  4h atrasado, e o que os logs não provam
- [Mutação Fit — rede e equipamentos](mutacao-fit-rede-equipamentos.md) — a 2ª academia:
  dois iDFace numa iDBlock Next, e por que a regra da COM4 não vale lá

### Loja e comercial
- [Loja marketplace](fitmind-loja-marketplace.md) — o que já foi corrigido na loja nova,
  a deriva da Lovable, e as RLS que pareciam prontas
- [Loja unificada](fitmind-loja-unificada.md) — repo, gate de teste, carrinho multi-vendedor
  e as armadilhas do build local
- [Sistema de taxas](fitmind-sistema-de-taxas.md) — `taxas_vigentes` é a fonte única, e o que
  na loja ficou de fora de propósito
- [Estorno de venda](fitmind-estorno-de-venda.md) — as carteiras são derivadas do razão,
  estornar é desfazer o fato e recalcular, e o que o estorno não faz
- [Benefícios de venda](fitmind-beneficios-de-venda.md) — desafio, carteirinha e pontos:
  duas réguas, e por que R$ 150 não dá ticket
- [PDV de estacionamento](fitmind-pdv-estacionamento.md) — o app que roda **dentro** da
  Point Smart: o que o SmartApp exige do Mercado Pago, e os dois atritos do motor de venda
- [Fechamento da rede](fitmind-fechamento-da-rede.md) — a regra de subir para o upline que
  bateu meta, e o que já foi fechado
- [Pedido de parceria](fitmind-pedido-de-parceria.md) — o que o pedido cria sozinho (espelho,
  mensalidade, unidade), por que não há "recusar", e o furo que deixa se autoaprovar

### Fiscal
- [Fiscal Spark API](fiscal-spark-api-projeto.md) — a vertical de NFS-e: reiniciada em
  `fiscal-engine`, por que Node em vez de workerd, e as datas de Cuiabá e VG

## Isto já é a memória do assistente

Os arquivos estão no formato de memória do Claude Code (com frontmatter). Na máquina
do Erick a pasta de memória é uma **junção** para cá: editar aqui é editar a memória,
uma cópia só, versionada. Para repetir numa máquina nova — o caminho depende de onde
o Claude Code foi aberto, confira o slug antes:

```
rmdir /S /Q "%USERPROFILE%\.claude\projects\<slug-do-cwd>\memory"
mklink /J "%USERPROFILE%\.claude\projects\<slug-do-cwd>\memory" "C:\dev\fitmind-bugs\docs\contexto"
```

Sem a junção também funciona: os arquivos continuam aqui e são lidos sob demanda.
O que a junção resolve é a **divergência** — sem ela existem duas cópias do mesmo
contexto, e elas se separam na primeira vez que alguém edita só uma.
