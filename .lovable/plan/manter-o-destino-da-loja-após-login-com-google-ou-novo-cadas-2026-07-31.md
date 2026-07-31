# Manter o destino da loja após login com Google ou novo cadastro

Hoje o link `/r/CODE?to=loja` (e o link de produto) leva a pessoa deslogada para a loja pública. Quando ela entra com Google ou cria conta, o app termina em "escolher painel" / painel do aluno e o destino da loja se perde. O indicador continua salvo — o que falta é lembrar **para onde** a pessoa estava indo.

## O que muda

1. Ao abrir um link de indicação com destino de loja ou produto, o app guarda essa intenção de forma durável (sobrevive ao redirect do Google e ao cadastro por formulário).
2. Os botões "Criar conta" / "Entrar" da loja pública e da página de produto passam a levar essa intenção junto.
3. Ao final do login com Google, do cadastro por formulário e do "completar cadastro", a pessoa cai direto na **loja logada do aluno** — com o produto já aberto quando o link tinha produto.
4. A intenção é consumida uma única vez (não fica presa em acessos futuros) e só aceita caminhos internos do próprio app.

## Detalhes técnicos

- Novo módulo `src/lib/post-auth-intent.ts`: `setPostAuthIntent(path)`, `takePostAuthIntent()` gravando em `localStorage` + `sessionStorage`, validando que o caminho começa com `/` (e não `//`).
- `src/routes/r.$code.tsx`: para visitante deslogado, gravar a intenção — `/student/store?produto={id}` quando há `p`, ou `/student/store` quando `to=loja`.
- `src/routes/loja.tsx`, `src/components/store/public/PublicProductModal.tsx`, `src/routes/produto.$id.tsx`: nos CTAs de cadastro/login, gravar a mesma intenção (com o id do produto quando aplicável) antes de navegar para `/register` ou `/login`.
- `src/components/auth/GoogleSignInButton.tsx`: se `nextPath` não for passado, usar a intenção gravada como `fitmind:auth-next`, mantendo o backup em `localStorage` (o `sessionStorage` não sobrevive ao OAuth em alguns aparelhos).
- `src/routes/auth.callback.tsx`: ler a intenção (session ou backup) e, para papel aluno, redirecionar para ela em vez de `/portal-selector`; definir `fitmind_selected_area = student` antes.
- `src/routes/complete-signup.tsx`: mesma regra ao concluir o cadastro sem papel especial.
- `src/components/auth/StudentRegistration.tsx`: trocar o `navigate({ to: "/student" })` fixo pela intenção quando existir.
- Nenhuma mudança de banco, RLS ou regra de comissão; a atribuição do indicador continua usando `referral-signup.ts`/`atribuicao.ts` como hoje.
