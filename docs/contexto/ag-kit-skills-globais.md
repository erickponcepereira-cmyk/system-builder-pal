---
name: ag-kit-skills-globais
description: "As skills globais vieram do AG Kit por juncao de diretorio; 14 foram desligadas de proposito e o kit e feito para Antigravity, nao para Claude Code"
metadata: 
  node_type: memory
  type: project
  originSessionId: 51999e15-d33b-440c-8408-f96e37a47d58
  modified: 2026-08-28T03:17:33.615Z
---

Em 27/08/2026 instalei o AG Kit (`@vudovn/ag-kit`, CalVer 2026.7.27) como fonte das skills globais.

**Layout:** o kit vive em `C:\Users\erick\.claude\ag-kit\.agents\`. As skills ativas em `C:\Users\erick\.claude\skills\` **nao sao copias** — sao juncoes de diretorio (`New-Item -ItemType Junction`) apontando para `.agents\skills\<nome>`. Por isso `ag-kit update` propaga sozinho para as skills ativas, e apagar uma pasta em `.claude\skills\` so desliga a skill, nao perde conteudo. Para desfazer uma juncao sem risco de levar o alvo junto, use `[System.IO.Directory]::Delete($caminho, $false)` — apaga so o ponto de reparo; `rm -rf` no Git Bash e arriscado aqui.

**Excecao (28/08/2026): `clean-code` nao e mais juncao, e copia real** (`version: 2.1.0-local`). Motivo: a skill se declara `priority: CRITICAL` / "always active", mas a metade final mandava rodar 18 scripts Python por caminho relativo `.agents/skills/...` (que nao existe dentro dos projetos) e impunha um protocolo "READ -> SUMMARIZE -> ASK" proibindo aplicar correcao sem pedir permissao. Cortei essas duas secoes e troquei por uma que aponta para o tooling do proprio projeto e para `/code-review`, `/simplify`, `/security-review`. Original preservado no kit (md5 `a96af5e296005355db8326160cfb48bc`); backup em `clean-code-backup` no scratchpad da sessao. Por ser copia, `ag-kit update` nao a sobrescreve — mas tambem nao a atualiza: se o kit mudar essa skill, o merge e manual.

**Python nao esta instalado nesta maquina** (`python` cai no stub da Microsoft Store, `py` nao existe). Isso torna decorativos os 18 scripts de validacao citados por varias skills (`ux_audit.py`, `security_scan.py`, `lint_runner.py`, `api_validator.py`, `react_performance_checker.py`...). Reforca independentemente a decisao de manter desligadas `vulnerability-scanner`, `lint-and-validate` e `code-review-graph` — sem Python sao cascas vazias.

**O kit nao e para o Claude Code.** O proprio `.agents/memory/MEMORY.md` dele declara que so suporta Gemini CLI e Google Antigravity. O `ag-kit init` cria `.agents/`, que o Claude Code nunca le; o `mcp_config.json` aponta para `~/.gemini/` e o hook usa o matcher `run_command` (aqui a ferramenta se chama `Bash`). O que salva e que os arquivos foram escritos no formato nativo do Claude Code (`SKILL.md` com name/description/allowed-tools, agentes com `model: inherit`, workflows com `$ARGUMENTS`) — uma skill credita `Source: obra/superpowers`. Portanto: conteudo portavel, encanamento nao. **Nunca rodar `ag-kit init` sem `--path`** — o diretorio padrao aqui e `C:\` e ele despejaria `.agents/` e `.ag-kit-backups/` na raiz do disco.

**14 skills ficaram desligadas de proposito** (seguem no kit, em `.agents/skills/`): code-review-checklist, code-review-graph, simplify-code, vulnerability-scanner, red-team-tactics, skillify, context-compression, memory-system, parallel-agents, coordinator-mode, intelligent-routing, behavioral-modes, plan-writing, lint-and-validate. Motivo: duplicam `/code-review`, `/simplify`, `/security-review` e `skill-creator` nativos, ou sao andaimes de prompt para runtime sem orquestracao nativa. A critica e a `memory-system`, que criaria um `MEMORY.md` concorrente do descrito em [[fitmind-como-trabalhar]].

Os 20 agentes e 13 workflows do kit **nao** foram ligados: os workflows invocam agentes pelo esquema do Antigravity.
