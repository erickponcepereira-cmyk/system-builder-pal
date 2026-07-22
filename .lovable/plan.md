## Objetivo
No cadastro de Profissional, permitir escolher entre **CNPJ** (padrão) e **CPF**, com validação de ambos, espelhando o comportamento já usado no cadastro de Parceiro. Sem quebrar o fluxo atual.

## Mudanças

### 1. `src/lib/masks.ts`
- Adicionar `isValidCNPJ(value)` com o algoritmo oficial dos dois dígitos verificadores (rejeita todos-iguais e tamanho ≠ 14).

### 2. `src/components/auth/PartnerRegistration.tsx`
- Passar a validar CNPJ com `isValidCNPJ` (hoje só valida CPF); mensagem "CNPJ inválido. Verifique os dados informados." Mantém tudo mais igual.

### 3. `src/components/auth/ProfessionalRegistration.tsx`
- Substituir o campo único de CPF por seletor **Tipo de documento** (CNPJ padrão / CPF) + input mascarado, igual ao Parceiro:
  - state `docType: "cnpj" | "cpf"` (default `"cnpj"`), state `doc` (mascarado).
  - máscara dinâmica (`maskCNPJ`/`maskCPF`), placeholder e label dinâmicos ("CNPJ *" / "CPF *").
  - validação: tamanho correto + `isValidCNPJ`/`isValidCPF`.
- No envio para `finalizeRegistrationFn`: continuar enviando o campo `cpf` **somente** quando `docType === "cpf"`. Para `cnpj`, enviar `cpf: null` (mantém coluna `profiles.cpf` intacta — só CPFs válidos entram lá, preservando a checagem de duplicidade existente).
- Guardar o documento (CNPJ ou CPF) e o tipo no registro de `coaches` reusando os campos já existentes se houver; caso contrário, apenas persistir o CPF quando aplicável. Não alterar schema nesta etapa.

### 4. Sem migração de banco
Nenhuma alteração de schema/RLS. `profiles.cpf` continua recebendo apenas CPF válido; CNPJ do profissional fica no formulário/registro conforme item 3 sem quebrar unique constraints.

## Fora de escopo
- Persistir CNPJ do profissional em nova coluna (pode ser um follow-up se você quiser exibi-lo no admin/relatórios — me avise).
- Alterar validação/UX de outros formulários.

## Detalhes técnicos
- `isValidCNPJ` usa pesos `[5,4,3,2,9,8,7,6,5,4,3,2]` para o 1º dígito e `[6,5,4,3,2,9,8,7,6,5,4,3,2]` para o 2º; resto `< 2 ⇒ 0`, senão `11 - resto`.
- Reaproveitar exatamente o padrão de JSX do `PartnerRegistration` (select + input) para manter consistência visual.