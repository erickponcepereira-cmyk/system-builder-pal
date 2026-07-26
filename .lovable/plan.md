## Problema

O "Editar perfil" do aluno em `src/routes/_authenticated/student.profile.edit.tsx` executa `supabase.from("profiles").update({...}).eq("id", profileId)` **sem `.select()`**. Se a atualização não atingir nenhuma linha (por RLS, id incorreto ou trigger silencioso), o PostgREST retorna 204 sem erro, o toast diz "Perfil atualizado!" e o usuário é redirecionado — mas nada foi persistido. É exatamente o sintoma reportado (aparenta salvar, mas não salva).

Os outros três painéis apresentam a mesma armadilha:
- **Coach** (`src/components/coach/tabs/CoachProfileTab.tsx`): `update(...).eq("id", coach.profileId)` em `profiles` e `coaches`, sem `.select()`.
- **Profissional** (`src/components/professional/SettingsTab.tsx`): `update(...).eq("id", profileId)` em `profiles` + `upsert` em `professional_public_profile`, sem `.select()`.
- **Parceiro** (`ProfilePanel` dentro de `src/routes/_authenticated/partner.tsx`): a confirmar mesmo padrão de update sem verificação.

## Correção

1. **Aluno — `student.profile.edit.tsx`**
   - Trocar o update por `.update({...}).eq("id", profileId).eq("user_id", userId).select("id").maybeSingle()`.
   - Se retornar `null` (0 linhas), mostrar toast de erro real ("Não foi possível salvar — sessão/RLS") em vez de sucesso, e **não** navegar.
   - Manter o fluxo de troca de email (auth.updateUser) como está, apenas garantindo que a mensagem de "confirme o novo e-mail" só apareça após o update do profile ter retornado linha.

2. **Coach — `CoachProfileTab.tsx`**
   - Adicionar `.select("id").maybeSingle()` nos dois updates (`profiles` e `coaches`).
   - Só chamar `onLocalChange` / `onSaved` se ambos retornarem linha; caso contrário, toast de erro específico.

3. **Profissional — `SettingsTab.tsx`**
   - `.select("id").maybeSingle()` no update de `profiles` e no `upsert` de `professional_public_profile`.
   - Idem para `uploadAvatar` (hoje ignora o retorno do update de `avatar_url`).

4. **Parceiro — `ProfilePanel` em `partner.tsx`**
   - Ler a função (linha ~1545) e aplicar o mesmo padrão nos updates de `profiles` e `partners`.

5. **Verificação** — após implementar, rodar Playwright headless logado como aluno de teste, editar nome/bio, recarregar a página e conferir via `supabase--read_query` se os valores realmente foram gravados; repetir para coach, profissional e parceiro.

## Fora do escopo

- Não mexer em RLS de `profiles` (a policy `profiles_own_update` está correta).
- Não alterar UI/layout dos formulários; apenas robustez do save.
