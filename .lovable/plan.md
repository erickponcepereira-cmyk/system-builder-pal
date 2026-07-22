## Causa raiz

As policies RLS de `product_coproductions` comparam `coaches.profile_id` / `partners.profile_id` diretamente com `auth.uid()`.

Só que `auth.uid()` retorna o **user_id** do Supabase Auth, enquanto `profile_id` referencia `profiles.id` — e no banco `profiles.id != profiles.user_id` em todos os 115 perfis. Ou seja, a condição nunca casa, e qualquer INSERT (mesmo pelo dono legítimo) cai em "new row violates row-level security policy".

## Correção

Migration única reescrevendo as 4 policies (`insert`, `read`, `update`, `delete`) de `public.product_coproductions` para atravessar `profiles`:

```
EXISTS (SELECT 1 FROM coaches c
        JOIN profiles p ON p.id = c.profile_id
        WHERE c.id = product_coproductions.creator_id
          AND p.user_id = auth.uid())
```

E o equivalente para `partners` e para os ramos `collaborator_*`.

Sem mudanças de código de aplicação — o `inviteCoproducer` já envia `creator_type`/`creator_id` corretos.

## Verificação

- Rodar `supabase--linter` após a migration.
- Confirmar que a Delma consegue salvar coprodutor no modal do print.
