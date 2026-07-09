## Objetivo

Melhorar a experiência de criação/redefinição de senha com:

1. Mensagens de erro em português (BR) mais claras quando a senha for rejeitada por ser vazada (HIBP) ou comum, em vez do genérico "Senha fraca".
2. Um medidor visual de força de senha em tempo real nos formulários de senha.

## Mudanças

### 1) Tradução de erros (`src/lib/auth-errors.ts`)

- Detectar variações do provider para senha vazada/comum:
  - `"pwned"`, `"has been leaked"`, `"compromised"`, `"password is known"` → **"Esta senha apareceu em vazamentos de dados conhecidos. Escolha uma senha única diferente."**
  - `"weak password"`, `"password is too weak"`, `"password strength"` → **"Senha muito fácil de adivinhar. Evite sequências (123, abc), palavras comuns e datas. Combine palavras aleatórias, números e símbolos."**
  - `"password should be at least"` / `"too short"` → **"A senha deve ter pelo menos 8 caracteres."**
- Manter fallback atual para outros casos.

### 2) Componente `PasswordStrengthMeter` (novo)

- Arquivo: `src/components/auth/PasswordStrengthMeter.tsx`.
- Recebe `password: string` e opcional `email?: string` / `name?: string` para penalizar semelhança.
- Cálculo local (sem libs novas):
  - Score 0–4 baseado em: comprimento (≥8, ≥12, ≥16), variedade (minúscula, maiúscula, número, símbolo), penalidades por sequências (`123`, `abc`, `qwerty`), repetições (`aaaa`), palavras comuns em PT/EN (`senha`, `password`, `admin`, `fitness`, `123456`, `qwerty`), e semelhança com email/nome.
  - Lista embutida curta de senhas muito comuns.
- UI: barra segmentada (4 blocos) com cores do design system (destructive → warning → primary → success) + rótulo: **Muito fraca / Fraca / Razoável / Forte / Muito forte**.
- Checklist com ícones (✓/○) para: 8+ caracteres, maiúscula, minúscula, número, símbolo, sem sequências óbvias.
- Nota informativa: **"Senhas que já apareceram em vazamentos serão rejeitadas mesmo cumprindo todos os requisitos."**

### 3) Integração nos formulários existentes

Adicionar o medidor abaixo do campo de senha (sem alterar validação/submit atual):

- `src/routes/reset-password.tsx` (campo "Nova senha").
- `src/routes/register.tsx` (se houver campo de senha no cadastro).
- Qualquer outra tela de definição de senha encontrada durante a implementação (será verificada com busca).

### Fora do escopo

- Não alterar política do provider (HIBP continua ativo).
- Não bloquear submit com base no medidor (o servidor continua sendo a fonte de verdade); o medidor é apenas orientativo.
- Sem novas dependências.

## Arquivos afetados

- `src/lib/auth-errors.ts` (editar)
- `src/components/auth/PasswordStrengthMeter.tsx` (criar)
- `src/routes/reset-password.tsx` (editar)
- `src/routes/register.tsx` e demais telas de senha localizadas (editar)