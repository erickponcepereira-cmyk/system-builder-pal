## Problema

Hoje `/r/{codigo}` (sem parâmetros) envia a pessoa para a loja pública. Isso quebrou o link de indicação: ele existe para levar ao **cadastro** com o indicador travado.

## O que muda

1. **Destino padrão volta a ser o cadastro**
   - `/r/{codigo}` → `/register` (atribuição do indicador continua igual: sessão + localStorage).
   - `/r/{codigo}?to=cadastro` → `/register` (continua funcionando).
   - `/r/{codigo}?to=loja` → `/loja` (novo link explícito da loja vinculada ao indicador).
   - `/r/{codigo}?p={id}` → página do produto (sem alteração), pois é um link de venda direta.
   - Convite inválido continua oferecendo a loja como saída.

2. **Novo "Link da loja" nos painéis**
   Onde hoje existe um único botão de indicação, passam a existir dois, lado a lado:
   - **Link de indicação** (cadastro): `/r/{codigo}`
   - **Link da loja**: `/r/{codigo}?to=loja`
   Cada um com copiar e compartilhar no WhatsApp.

   Painéis afetados: Coach (visão geral/indicação), Parceiro, Profissional (visão geral e colaboradores), Aluno (perfil/benefícios), e a listagem de links do Admin passa a mostrar as duas variantes por pessoa.

3. **Textos da tela de convite**
   O texto de transição passa a dizer "Levando você ao cadastro…", "Abrindo a loja…" ou "Abrindo o produto…" conforme o destino real.

## Detalhes técnicos

- `src/routes/r.$code.tsx`: inverter a ordem de decisão no `setTimeout` — cadastro como padrão, `to=loja` para a loja; manter o atalho de aluno já logado (vai para a loja logada) e o caminho de `p={id}`.
- Criar helper em `src/lib/atribuicao.ts` (ou novo `src/lib/referral-links.ts`) com `linkCadastro(code)` e `linkLoja(code)`, para os painéis não montarem string na mão.
- Atualizar os pontos que montam `/r/${code}`: `coach.tsx`, `partner.tsx`, `professional/OverviewTab.tsx`, `professional/CollaboratorsTab.tsx`, `ProfessionalCollaboratorsPanel.tsx`, `student.profile.tsx`, `student.benefits.tsx`, e `admin-referral-links.functions.ts` + a página admin de links.
- Sem mudança de banco de dados.
