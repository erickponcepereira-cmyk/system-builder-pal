# Segurança dos jobs internos

Os endpoints abaixo executam tarefas privilegiadas e não aceitam mais a chave pública/anon do Supabase. Todos exigem `Authorization: Bearer <INTERNAL_CRON_SECRET>`, com segredo aleatório de pelo menos 32 caracteres configurado somente no backend e no secret manager do agendador.

- `POST /api/public/career/reset-expired`
- `POST /api/public/hooks/avisos-automaticos`
- `POST /api/public/hooks/challenge-final-weighin`
- `POST /api/public/hooks/mp-sweep`
- `POST /api/public/hooks/network-unlock-snapshot`
- `POST /api/public/hooks/recurring-charge`

O processador de exclusão usa outro segredo, `ACCOUNT_DELETION_PROCESSOR_SECRET`, para reduzir o impacto de uma credencial comprometida.

## Rotação/implantação

1. Gerar os dois segredos fora do Git e do chat.
2. Configurá-los no backend e no Vault/secret manager do agendador.
3. Trocar cada job para bearer token e remover o header `apikey` antigo.
4. Testar que uma chamada sem token e uma chamada com a anon key retornam 401.
5. Testar que token correto retorna 2xx e que a execução idempotente não duplica cobrança, aviso, relatório ou snapshot.
6. Rotacionar imediatamente se um valor aparecer em log, migration, commit, ticket ou captura de tela.

Nunca usar `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY` para autenticar jobs privilegiados: essas chaves são públicas por definição e estão presentes no aplicativo distribuído.
