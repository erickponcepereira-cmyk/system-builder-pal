# Grupo de WhatsApp próprio do parceiro e do profissional

Parceiros e profissionais poderão cadastrar o próprio grupo de WhatsApp. Ele aparece para a rede direta deles (alunos e coaches vinculados), logo abaixo do card do grupo oficial FitMind.

## O que muda

### 1. Nova aba "Meu grupo do WhatsApp"
Nos painéis de **Parceiro** e **Profissional**, uma aba nova com um formulário simples:
- Nome do grupo (ex.: "Time Carol Aventureira")
- Link do grupo (`https://chat.whatsapp.com/...`) **ou** número de WhatsApp — o campo aceita os dois e o sistema identifica qual é
- Descrição curta opcional (linha secundária do card)
- Chave liga/desliga para exibir ou ocultar sem apagar
- Prévia do card exatamente como o vinculado vai ver, e botão de testar o link

Validação: link de convite do WhatsApp válido, ou número com DDD (converte para `wa.me`, assumindo Brasil quando não houver código do país).

### 2. Onde o grupo aparece
Para o aluno (`student.index`) e para o coach (aba Visão Geral), abaixo do card do grupo oficial FitMind, aparecem os cards dos grupos dos parceiros/profissionais da rede direta do usuário — mesmo visual do card atual, com o nome cadastrado e um selo discreto identificando o dono do grupo.

Rede direta = quem está vinculado diretamente ao parceiro/profissional: alunos com aquele coach responsável, colaboradores e coaches indicados diretamente por ele. Não desce para níveis mais abaixo da rede.

Se não houver grupo cadastrado, nada muda — só o card FitMind aparece.

## Detalhes técnicos

**Banco** — nova tabela `whatsapp_groups`:
- `id`, `owner_coach_id` (referência a `coaches.id`, único), `owner_kind` (`partner` | `professional`), `name`, `invite_url`, `phone`, `description`, `is_active`, timestamps
- GRANTs para `authenticated` e `service_role` (sem `anon`)
- RLS: dono lê/escreve o próprio registro; admin lê tudo. A leitura da rede não passa por policy aberta — é feita por função de servidor.

**Servidor** — `src/lib/whatsapp-groups.functions.ts`:
- `getMyWhatsappGroup` / `saveMyWhatsappGroup`: leitura e gravação do registro do usuário logado, validando que ele é parceiro ou profissional
- `listMyNetworkWhatsappGroups`: resolve os vínculos diretos do usuário logado (aluno ou coach) e devolve apenas nome, descrição e URL final já normalizada dos grupos ativos

**Frontend**:
- `src/components/shared/WhatsappGroupSettings.tsx` — formulário reutilizado pelos dois painéis
- Nova aba registrada em `partner.tsx` e `professional.tsx` (`TAB_META` + lista de abas)
- `WhatsAppGroupCard.tsx` ganha props opcionais (título, descrição, url) para reaproveitar o visual
- Novo `NetworkWhatsappGroups.tsx` renderizado logo depois do `WhatsAppGroupCard` em `student.index.tsx` e em `components/coach/tabs/OverviewTab.tsx`
- Normalização de número reaproveita `src/lib/whatsapp.ts` (`whatsappUrl`)
