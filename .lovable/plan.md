## Objetivo

Substituir todo o conteúdo atual de `/student/coach-course` por uma jornada de conversão em 4 blocos: explicação inspiracional → trilha (curso + análise de perfil) → pitch + compra → contato direto do coach upline.

## Estrutura nova da página

### 1. Hero + Modal "Por que ser Coach FitMind"
- Card de topo com CTA "Entenda a oportunidade" que abre um `Dialog`.
- Texto do modal (versão refinada do briefing):
  > **Torne-se Coach FitMind e construa ganhos sem teto.**
  > Monte sua própria rede, venda produtos e serviços do ecossistema, participe de desafios premiados e transforme a sua paixão por saúde em uma carreira escalável. Você ganha indicando, ganha vendendo e ganha pelo crescimento de quem entra com você. Tudo com a estrutura, a metodologia e a marca FitMind ao seu lado.
- Bullets curtos: "Comissões recorrentes", "Bônus de rede", "Desafios e premiações", "Carreira reconhecida".

### 2. Trilha para se tornar Coach (2 passos visíveis)

**Passo 1 — Curso "Ativação Coach – Anual"**
- Card com selo "Obrigatório", descrição do curso, duração, e botão `Acessar curso`.
- Sem checklist de módulos individuais (toda a antiga listagem de `coach_course_modules` sai da tela; mantemos a tabela no banco, apenas escondemos da UI).
- Estado visual: `Pendente` / `Em andamento` / `Concluído` baseado em `coach_course_progress` agregado (qualquer registro = em andamento; 100% dos módulos obrigatórios = concluído).

**Passo 2 — Análise de Perfil Comportamental**
- Card explicando: "Preencha sua análise de perfil comportamental e receba um relatório com os produtos e serviços que você tem mais facilidade de vender."
- Botão `Iniciar análise` (por ora abre um modal placeholder "Em breve" — a implementação do questionário/relatório fica fora do escopo desta página, será uma rota própria depois). Status: `Não iniciada`.

### 3. Pitch + Produto à venda (Ativação Coach – Anual)
- Card destaque com:
  - Headline curta de pitch ("Pronto pra ativar? Comece hoje sua jornada Coach FitMind.")
  - Preço e descrição do produto "Ativação Coach – Anual" (buscado de `products`/`store_items` pelo SKU/slug configurado; fallback hardcoded se não existir).
  - Botão **Comprar agora** → reaproveita o fluxo de checkout existente (`MercadoPagoCheckout` ou rota `pay.$orderNumber`) já usado em outros pontos do app.

### 4. Fale com seu Coach (upline 1)
- Bloco final mostrando nome, foto e WhatsApp do coach vinculado ao aluno (`students.coach_id` → `coaches` → `profile`), com botão **Falar no WhatsApp** usando `whatsappUrl()` e mensagem pré-preenchida ("Olá! Quero entender melhor como me tornar Coach FitMind.").
- Texto de apoio: "Seu coach pode te orientar e tirar dúvidas antes da decisão."

## Itens removidos da tela
- Listagem de módulos do curso (`modules.map(...)`).
- Formulário de solicitação para Coach (motivação, experiência, cidade, telefone, seletor de coach, botão `Enviar solicitação`).
- Barra de progresso percentual de módulos.

Mantemos os imports/dados de banco somente onde forem reaproveitados (status agregado do curso e coach upline).

## Arquivos afetados
- `src/routes/student.coach-course.tsx` — reescrita completa do componente.
- (Eventual) novo componente local de modal `BecomeCoachInfoModal` no mesmo arquivo, sem novos arquivos.

## Pontos técnicos
- Buscar coach upline: `profiles → students(coach_id) → coaches(profile_id) → profiles(name, phone, avatar_url)`.
- Buscar produto "Ativação Coach – Anual": tentar `products` por slug `ativacao-coach-anual`; se não existir, mostrar card estático com aviso "Configurar produto no admin" só em dev — em produção, esconde o botão de compra e mostra "Em breve".
- Checkout: usar o mesmo padrão já presente em `student.store.tsx` (a confirmar ao implementar).
- Não criar tabelas novas. A análise de perfil comportamental fica como placeholder visual nesta etapa.

## Fora de escopo
- Implementação do questionário e do relatório de perfil comportamental.
- Criação automática do produto "Ativação Coach – Anual" no catálogo (precisa estar cadastrado no admin).
