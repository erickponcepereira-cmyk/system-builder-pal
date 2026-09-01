---
name: ag-kit-segundo-pc
description: "O segundo PC (DESKTOP-OSGFS1V) montou o AG Kit por conversao, nao por juncao, e ligou agentes e workflows que o primeiro deixou desligados"
metadata:
  type: project
---

Em 01/09/2026 o segundo computador entrou em uso: **DESKTOP-OSGFS1V**, usuario Windows
`Yasmin`, perfil em `C:\Users\aliss`. Chegou zerado — sem Node, sem Python, sem `C:\dev`,
sem nada em `.claude`. O repo esta em `C:\dev\fitmind-bugs`, mesmo caminho do primeiro PC.

**Juncao da memoria:** `C:\Users\aliss\.claude\projects\C--dev-fitmind-bugs\memory` aponta para
`C:\dev\fitmind-bugs\docs\contexto`. O slug muda por maquina e por pasta de abertura — aqui e
`C--dev-fitmind-bugs` porque a sessao e aberta na pasta do repo. Vale a mesma regra de sempre:
para desfazer, `[System.IO.Directory]::Delete($caminho, $false)`, nunca `rm -rf` no Git Bash.

**Autenticacao do GitHub:** nao precisou de token nem de `gh auth login`. O Git desta maquina ja
vem com `credential.helper=manager` no config de sistema, e o Git Credential Manager resolveu pelo
navegador aproveitando a sessao do Chrome ja logada. Detalhe que custa tempo: o shell do assistente
roda sem interatividade, entao o primeiro `git clone` morre com `fatal: Cannot prompt because user
interactivity has been disabled`. O que destrava e forcar `GCM_INTERACTIVE=always` +
`GIT_TERMINAL_PROMPT=1` e `-c credential.interactive=always -c credential.guiPrompt=true` —
ai o GCM abre a janela no navegador em vez de tentar o terminal.

**Python esta instalado aqui** (3.13.15, escopo de usuario, via winget), diferente do primeiro PC.
Node 24.19.0 e GitHub CLI 2.98.0 tambem. Isso derruba um dos motivos registrados em
[[ag-kit-skills-globais]] para manter skills desligadas: os scripts `.py` que eram cascas vazias
la, aqui rodam.

## Onde as duas maquinas divergem

O primeiro PC ligou as skills por **juncao** para `.agents/skills/<nome>`, deixou os 20 agentes e
os 13 workflows **desligados**, e manteve 14 skills fora. Aqui foi diferente, de proposito:

- **Skills sao copias convertidas, nao juncoes.** Um conversor (`~/.claude/ag-kit/ag2claude.mjs`)
  le a arvore do kit e reescreve para o formato do Claude Code. Custo: `ag-kit update` nao
  propaga sozinho — tem que rodar o conversor de novo depois. Ganho: os caminhos `.agents/...`
  viram caminhos reais e as referencias de runtime deixam de mentir.
- **15 agentes e 13 workflows ficaram ligados.** O motivo registrado para deixa-los de fora era
  que invocavam agentes pelo esquema do Antigravity — o conversor corrige isso: ferramentas
  inexistentes (`ViewCodeItem`, `FindByName`) viram `Glob`/`Grep`, e os workflows viraram slash
  commands sob `/ag:` para nao colidir com `/plan` e `/status` nativos.
- **Das 14 skills desligadas, 5 voltaram; 3 foram desligadas de novo.** `code-review-checklist`,
  `simplify-code` e `vulnerability-scanner` saíram no mesmo dia: duplicam `/code-review`,
  `/simplify` e `/security-review`, e esse argumento nao depende de Python. Continuam ligadas
  `lint-and-validate` (roda o lint/typecheck do proprio projeto, que nao tem comando nativo, e e
  citada por dois agentes) e `plan-writing`, `parallel-agents`, `coordinator-mode`,
  `context-compression` — estas quatro porque aqui os agentes que as usam **estao** ligados.
  Total ativo: 25 skills.
- **`memory-system` continua fora** nas duas maquinas, pelo mesmo motivo: competiria com a memoria
  nativa descrita em [[fitmind-como-trabalhar]].
- **`clean-code` recebeu o mesmo corte do primeiro PC** (protocolo READ -> SUMMARIZE -> ASK e a
  lista de 18 scripts por caminho relativo). Como e copia, `ag-kit update` nao desfaz.
- **Hooks nao foram portados** em nenhuma das duas: o schema do Claude Code e outro e hook mal
  portado bloqueia chamada de ferramenta.

As regras do kit, que no Antigravity eram `always_on`, viraram `C:\Users\aliss\.claude\CLAUDE.md`
aqui — inclusive a obrigacao de anunciar `📚 Usando skill: @nome` antes de aplicar cada skill.

> Enquanto as duas maquinas nao convergirem, o mesmo pedido pode ser atendido de formas
> diferentes dependendo de onde a sessao abriu. E exatamente o tipo de deriva que a memoria
> versionada existe para evitar.
