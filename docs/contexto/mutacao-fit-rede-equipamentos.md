---
name: mutacao-fit-rede-equipamentos
description: "Mutação Fit (2ª academia do SaaS): rede 192.168.18.x, DOIS iDFace em catraca iDBlock Next primário/secundário — topologia diferente da academia de teste"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3f03cccd-c1bb-4024-9410-41ebd8fceefc
  modified: 2026-08-19T19:01:15.923Z
---

Levantado em 19/08/2026, de dentro da rede da academia, **só por leitura** — nenhum
login feito, nenhuma configuração tocada.

**Não confundir com a Estação Treinamento Funcional (a academia de teste).** São
instalações diferentes, com equipamento de gerações diferentes:

| | Estação (teste) | **Mutação Fit** |
|---|---|---|
| Sub-rede | `192.168.15.x` | **`192.168.18.x`** |
| PC / Next Fit | `192.168.15.13:8081` | **`192.168.18.98:8081`** |
| Leitores Control iD | 1 (`.15.240`, fw 6.21.4) | **2: `.18.211` e `.18.212`** |
| Giro da catraca | byte `0x4C` na COM4 do PC | **iDBlock Next pelo SecBox do leitor** |

**Os dois equipamentos são leitores faciais** (família iDFace/iDFace Max) — ambos
expõem toda a API de imagem de usuário (`user_set_image_list`, `user_get_image`…).
Um em cada lado da catraca bidirecional.

**Quem é o primário:** `192.168.18.211` é o único dos dois que implementa
`new_user_identified.fcgi`, `device_is_alive.fcgi` e `new_card.fcgi` — as rotas que
*recebem* evento de outro equipamento. `.212` responde `Invalid command` nas três.
Como o `.212` roda bundle **mais novo** e mesmo assim não tem essas rotas, a
diferença é de **papel**, não de versão: `.211` = **Primário**, `.212` = **Secundário**.

**A catraca não é dispositivo de rede aqui.** É a **iDBlock Next**, ligada ao leitor
primário pelo **SecBox serial** (`secbox_is_active.fcgi`, `secbox_serial_number.fcgi`,
`update_secbox_firmware*.fcgi`, `TURNSTILE.UPDATE_FROM_PRIMARY`). Consequência para o
FitMind: **a conclusão da COM4/0x4C da Estação NÃO vale aqui** — nesta academia o giro
sai do próprio leitor, então provavelmente **não é preciso fechar o Next Fit para
tomar a porta serial**. Isso precisa ser provado no ferro, não assumido.

**A causa provável do "só gira para um lado"** está em Modo de Operação → Catraca,
nas chaves que a interface expõe:
- `OPMODE.PRIMARY_CAN_BOTH` — "Primário pode liberar ambos os sentidos (Padrão)"
- `OPMODE.PRIMARY_CAN_ENTRANCE` — "Primário libera sentido de entrada e mantém a
  saída bloqueada" ← é exatamente o sintoma
- `OPMODE.TURNSTILE.ONE_FACIAL` — "Liberação de giro com um único equipamento facial"
- `OPMODE.TURNSTILE.STD` — estado padrão (sempre controlado / horário liberado /
  anti-horário liberado / ambos liberados)

**ARMADILHA GRAVE, anotada antes de alguém mexer:** a própria interface avisa
`OPMODE.CONNECT.CHANGE_ROLE_WARNING` = *"Confirmar mudanças no modo de operação?
Atenção: a base de dados será restaurada e o aparelho será reiniciado!"*. Trocar o
papel do equipamento **apaga a base de usuários e rostos**. Exportar os usuários e
templates dos dois leitores **antes** de qualquer mudança de modo.

Tudo isso é alcançável pela LAN a partir do notebook do Erick (`192.168.18.9`) —
**não precisa instalar nada no PC do cliente** para diagnosticar nem para corrigir.
Em 19/08/2026 **não havia agente FitMind em nenhuma máquina desta rede** (porta 3400
fechada em todos os 23 hosts). Falta a credencial dos leitores para ler
`get_configuration.fcgi` e confirmar o que está configurado.

Ver [[fitmind-leitor-idface]] (o leitor da academia de teste, geração antiga) e
[[catraca-solution-protocolo]].
