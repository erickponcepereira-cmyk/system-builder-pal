---
name: catraca-solution-protocolo
description: "Catraca Solution da Estação Treinamento Funcional: driver FitMind aprovado no hardware em 12/08/2026, e onde está o registro canônico"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e4322ed-4790-4527-8909-cd39a08137f1
  modified: 2026-08-12T21:31:41.912Z
---

Em 12/08/2026 o driver FitMind `solution-serial` foi provado na catraca real:
três ciclos consecutivos na mesma sessão serial, e rollback confirmado para o
Next Fit sem power-cycle. **Esta etapa está encerrada — não reabrir a
investigação do protocolo.**

O registro canônico está no repo, não aqui:

- `C:\dev\fitmind-acesso\HANDOFF-CATRACA.md` seção **3-A** — a prova completa,
  separando comando enviado, observação física, ausência de sniffer/ACK e
  rollback;
- `C:\dev\fitmind-acesso\catalogo-catracas.json` — o catálogo de modelos e
  protocolos que o SaaS multi-academia deve consumir para configurar outras
  unidades, com nível de prova explícito por item.

`C:\dev\fitmind-acesso` **não é repositório Git**. Isso é armadilha: não existe
histórico nem rollback por commit ali.

O que ficou provado é só o **driver físico**. Ainda não existe: validação de
contrato, autenticação do iDFace, proteção contra replay, nem idempotência
persistida — hoje ela vive em memória e some no restart. Não ligar o
reconhecimento facial à COM4 antes disso. Ver [[fitmind-arquitetura-ecossistema]].

Técnica que funcionou para implantar em PC de produção de terceiro, sem instalar
nada: `node.exe` autocontido copiado junto + `node_modules` com prebuilds
**N-API**, que dispensam `npm ci`, compilador e internet no destino. É o mesmo
princípio do `baixar-node.bat` do conector.
