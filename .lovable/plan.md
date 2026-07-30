
## 1. Botão flutuante "Dúvidas? Fale com seu coach"

Botão fixo (canto inferior direito, acima da bottom-nav no mobile) em todos os painéis autenticados, com o texto "Dúvidas? Entre em contato com seu coach" e link do WhatsApp do patrocinador.

- Nova função de servidor `getMySponsorContact` (autenticada): resolve, para o usuário logado, o coach patrocinador e devolve nome + telefone.
  - Aluno → coach do `students.coach_id`.
  - Coach → coach de upline (`sponsor/upline`).
  - Parceiro/Profissional → coach indicador vinculado ao cadastro.
  - Sem patrocinador (ou admin) → cai no contato oficial FitMind, ou o botão não aparece (definido por ausência de telefone).
- Novo componente `SupportCoachFab.tsx` usando `whatsappUrl()` já existente, com mensagem pré-preenchida ("{saudação}, me chamo {primeiro nome}, sou aluno(a) da FitMind e tenho uma dúvida.").
- Montado uma única vez no layout `_authenticated/route.tsx` para valer em todos os painéis.

## 2. Indicação (coach) perdida no cadastro via Google

Causa confirmada na leitura do código:

- `/r/{code}` grava a atribuição em `localStorage` (`fitmind_atribuicao`) e `sessionStorage` (`fitmind_referral`) — isso funciona.
- **`/complete-signup` nunca lê essa atribuição**: ele renderiza o `CoachSelector` vazio e envia apenas `coachId` escolhido à mão, sem `referralCode`, `referredByStudentId` nem `partnerId`. Ou seja, quem entra por link de coach + Google escolhe outro coach (ou o Master) e a indicação some.
- Pela loja pública o efeito é o mesmo: a loja lê a indicação, mas os CTAs de cadastro/login levam ao fluxo Google que termina no `/complete-signup` sem indicação.

Correções:

- `/complete-signup` passa a ler `lerAtribuicao()` + `fitmind_referral` e pré-selecionar o coach indicador, **travado** (`CoachSelector locked`), com aviso "Você foi indicado por X". Só mostra seleção livre se não houver indicação.
- Enviar `referralCode`, `referredByStudentId` e `partnerId` no `completeGoogleStudentSignup` (o backend já aceita esses campos e hoje eles chegam nulos).
- `GoogleSignInButton` grava a atribuição vigente também em `localStorage` antes de sair para o Google (o `sessionStorage` não sobrevive ao redirect em alguns navegadores/WebView do APK).
- Garantir que todos os CTAs da loja pública para cadastro/login preservem a indicação (`comAtribuicao()`).
- Teste ponta a ponta com Playwright: abrir `/r/{code}?to=loja`, navegar até o cadastro, simular retorno do OAuth e conferir que o coach chega travado em `/complete-signup`.

## 3. "Entrar com o Google" em todos os painéis de cadastro

- O botão Google passa a aparecer **no topo** de cada formulário: Aluno, Coach, Parceiro e Profissional (hoje só existe na tela de escolha de perfil e no login), com separador "ou preencha os dados abaixo".
- O botão leva o papel escolhido (`role`) e a indicação para o retorno do OAuth, via `sessionStorage`.
- Após o retorno:
  - **Aluno**: fluxo atual de `/complete-signup` (nome, telefone, sexo, nascimento) — nome e e-mail já vêm do Google e ficam pré-preenchidos.
  - **Coach / Parceiro / Profissional**: `/complete-signup?role=...` renderiza o mesmo formulário de cadastro já existente, em "modo Google": sem os campos de e-mail e senha (a conta já existe) e com o nome pré-preenchido; pede apenas o que o Google não fornece (telefone, CPF/CNPJ, endereço, dados profissionais, aceite de termos, etc.).
  - Coach indicador aparece travado quando houver indicação.
- `resolveGoogleAccount` passa a considerar completude por papel (hoje só valida aluno), para não liberar o painel de um coach/parceiro/profissional com cadastro pela metade.

## Detalhes técnicos

- Arquivos principais: `src/routes/complete-signup.tsx`, `src/routes/auth.callback.tsx`, `src/components/auth/GoogleSignInButton.tsx`, `src/components/auth/{Student,Coach,Partner,Professional}Registration.tsx`, `src/lib/google-signup.functions.ts`, `src/lib/atribuicao.ts`, `src/routes/loja.tsx`, `src/routes/_authenticated/route.tsx`.
- Novos: `src/components/support/SupportCoachFab.tsx`, `src/lib/sponsor-contact.functions.ts`.
- Novas funções de servidor de conclusão por papel (`completeGoogleCoachSignup`, `...Partner...`, `...Professional...`) reutilizando `registration.server.ts`, sem duplicar regra de negócio nem criar perfil duplicado (mantendo a blindagem por e-mail já existente).
- Sem migração de banco prevista; se a resolução do patrocinador exigir join pesado, será encapsulada numa função SQL `security definer` de leitura.
