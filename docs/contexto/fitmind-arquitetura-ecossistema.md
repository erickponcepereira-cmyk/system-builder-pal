---
name: fitmind-arquitetura-ecossistema
description: "Topologia real dos projetos FitMind em C:\\dev — quais pastas são o mesmo repo, e o padrão de agente que roda no PC da academia"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e4322ed-4790-4527-8909-cd39a08137f1
  modified: 2026-08-12T21:31:32.088Z
---

Levantado em 12/08/2026, ao planejar o SaaS de gestão de academia.

`C:\dev\fitmind`, `C:\dev\fitmind-bugs` e `C:\dev\fitmind-fin` **são o mesmo
repositório** — `github.com/erickponcepereira-cmyk/system-builder-pal` — em
branches diferentes (`feat/mobile-shell`, `main`, `verif`). Não são três
produtos. `fitmind-bugs`/`main` é a cópia mais recente. Ver
[[fitmind-loja-unificada]].

O app é Vite + Capacitor + Supabase e já tem **~200 tabelas e 515 migrations**,
incluindo assinatura/mensalidade (`subscriptions`, `subscription_invoices`,
`recurring_charges`), financeiro (`transactions`, `wallets`, `commissions`,
`mercadopago_payments`), CRM (`crm_quadros`/`crm_cartoes`), robô de mensagens
(`bot_fluxos`/`bot_disparos`), `bioimpedance_evaluations`, `attendance_logs` e
`student_checkin_scans`. **Antes de "criar do zero" qualquer um desses módulos,
auditar o que já funciona** — o risco real do projeto é duplicação, não falta de
base.

`C:\dev\fitmind-conector` é outro tipo de coisa: um **agente local que roda no PC
da academia**, sem git. Hoje mantém a sessão de WhatsApp. O padrão dele é o que
importa e deve ser reaproveitado para acesso/catraca:

- roda no **mesmo PC** que tem a catraca;
- **só faz conexão de saída** (busca fila na nuvem) porque o PC está atrás do NAT
  da academia, sem IP fixo — a nuvem em Cloudflare não alcança ele;
- `baixar-node.bat` baixa Node dentro da própria pasta: nada é instalado na
  máquina, que é ambiente de produção de terceiro;
- fila local (`pendentes.json`) para sobreviver a queda de internet;
- autenticação por unidade via `conexaoId` + `segredo` no `config.json`.

`config.json` guarda o segredo em texto puro — mesma classe de problema do
`devices.json` em [[catraca-solution-protocolo]].

O driver de catraca provado em `C:\dev\fitmind-acesso` deve virar um módulo desse
conector, não um produto separado.
