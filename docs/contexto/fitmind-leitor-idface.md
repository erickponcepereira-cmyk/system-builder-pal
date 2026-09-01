---
name: fitmind-leitor-idface
description: "O leitor facial real da Estação Treinamento Funcional: firmware, a armadilha do campo match, o relógio errado e o que os logs dele não provam"
metadata:
  node_type: memory
  type: project
---

Levantado no equipamento real em 17/08/2026, de dentro da rede da academia.

**Quem é quem na rede:** leitor iDFace em `192.168.15.240` (firmware **6.21.4**,
série `0M0200/027951`, 10.000 biometrias). PC da academia em `192.168.15.13` —
lá moram o servidor do Next Fit (`:8081`, que é o destino atual dos eventos do
leitor, na tabela `devices` do próprio aparelho) e o agente FitMind (`:3400`).
Só existe **um** leitor Control iD nessa rede.

**A armadilha que custou uma ida à academia:** `user_set_image_list.fcgi` exige
`match` como **booleano JSON**. Mandar `1`/`0` devolve
`HTTP 400 {"error":"Invalid member 'match' (boolean expected, got uint64)"}`.
Era isso que fazia toda foto enviada pelo app ser recusada — não era qualidade
de imagem. Provado com `match: true` e `match: false`: **os dois geram 2
`face_templates`** (face_type 0 e 1), então `match` não é o que decide se o
rosto fica reconhecível nesse firmware. O leitor devolve as notas dele em
`scores` (`sharpness_quality`, `center_pose_quality`, `bounds_width`) — sinal
de qualidade melhor do que qualquer heurística de navegador.

**O relógio do leitor está ~4h atrasado** em epoch. Todo horário lido dele
(`access_logs`, `image_timestamp`) precisa de **+4h** para virar hora local.
Sem isso, os acessos da abertura da academia aparecem como madrugada.

**O leitor parou de registrar tentativas não reconhecidas em 29/07/2026.** Os
154 registros `event=3` (user 0, confiança 702–839) são todos anteriores; os
`event=6` (identificado, confiança 968–1341) seguem. Ausência de log **não
prova** que ninguém tentou passar.

Diagnóstico é barato e sem risco: `load_objects.fcgi` aceita `users`,
`face_templates`, `access_logs`, `devices`, `groups`, `areas`, `portals`,
`time_zones`, `access_rules`. Para sondar envelope de resposta sem gravar nada,
mande a lista vazia. Ver [[fitmind-agente-catraca]] e [[catraca-solution-protocolo]].

**O protocolo de publicação, capturado em 18/08/2026** (prova em
`C:\dev\fitmind-acesso\captura-idface.json`, 30 requisições reais): o leitor
publica em `POST /new_user_identified.fcgi` com corpo
**`application/x-www-form-urlencoded`** — não JSON — trazendo `user_id`,
`registration`, `confidence`, `event=8`, `portal_id`, `uuid` e `time`. E manda um
batimento `POST /device_is_alive.fcgi?device_id=…` com JSON `{"access_logs":N}`
a cada poucos segundos, que o Next Fit responde `{"result":{"event":200}}`.

**Não responder ao batimento no formato certo derruba o leitor**: ele exibe "erro
durante a comunicação com o servidor", para de ler rosto e não abre a câmera.
Aconteceu de verdade durante a captura. Volta ao normal ao restaurar o `Servidor`
na tabela `devices` — o valor da Estação é `192.168.15.13:8081`.

Ainda desconhecido: qual resposta faz a catraca **girar**. Só foi capturado o que
o leitor envia, não o que o Next Fit responde numa liberação.

**Tela e catraca sao canais SEPARADOS** (provado em 18/08/2026). Responder
`event:7` + `actions` + `message` faz o leitor mostrar o rosto EM VERDE, como numa
liberacao — mas NAO gira a catraca. O giro continua sendo o byte 0x4C na COM4, e
por isso o cutover ainda exige fechar o Next Fit. A hipotese que sobra e que o
Next Fit faz as duas coisas: responde ao leitor e escreve na serial.

E nao teste acao por `/remote_user_authorization.fcgi`: ele responde `{}` para
qualquer coisa — acao inventada, SecBox inexistente, lista vazia. Nao valida e
nao ecoa. O `so-secbox.mjs` de 31/07 usava esse endpoint, entao aquele teste foi
inconclusivo, nao negativo.
