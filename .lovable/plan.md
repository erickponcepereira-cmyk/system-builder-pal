# Painel de parceiro sumiu após cadastrar a filial (Jean)

## O que aconteceu (verificado no banco)

O login do Jean (reismuaythai17@gmail.com) agora tem **duas unidades**:

- Reino Muay Thai — aprovada (anuidade paga em 30/06)
- Reino Muay Thai JR Fitness — criada hoje 22:01, status pendente

Ambas aparecem corretamente como "dono" na tabela de membros. O problema não é de permissão: várias partes do sistema ainda perguntam ao banco por **uma única** empresa parceira ligada ao perfil. Com duas unidades, essa consulta devolve erro em vez de resultado, e o sistema conclui que o usuário **não é parceiro** — por isso o atalho/painel de parceiro sumiu.

Pontos confirmados que fazem essa consulta de linha única:

- Seletor de perfis (`RoleSwitcher`) — some o botão "Parceiro"
- Seletor de portais (`portal-selector`)
- Portão de onboarding do parceiro (`getMyPartnerOnboarding`)
- Mensalidade (`subscriptions.functions`), anuidade, carteira, código de indicação, boletos Herbalife, saques, tickets de desafio, pagamento com saldo

## O que será feito

1. **Regra única de "qual unidade representa este login"**: sempre que o sistema precisar de uma unidade, escolher a **unidade principal** — a aprovada mais antiga; se nenhuma estiver aprovada, a mais antiga. Nunca mais falhar por existir mais de uma.
2. **Corrigir todos os pontos listados** para usar essa regra, devolvendo lista quando fizer sentido (ex.: saques, relatórios) e a unidade principal quando for identidade do usuário (perfis, mensalidade, anuidade, carteira, indicação).
3. **Portão de onboarding**: avaliar a unidade principal. Uma filial nova pendente não pode bloquear nem esconder o painel de quem já tem unidade aprovada e anuidade paga; a filial fica marcada como "aguardando liberação" apenas dentro do seletor de unidades.
4. **Anuidade/mensalidade por login, não por unidade**: manter a cobrança vinculada à unidade principal para não gerar cobrança nova a cada filial cadastrada.
5. **Verificação**: conferir no login do Jean que o painel de parceiro reaparece, que ele alterna entre as duas unidades e que a filial pendente aparece com o aviso de aprovação.

## Detalhes técnicos

- Novo helper compartilhado (ex.: `src/lib/partner-primary.ts` + versão server em `.server.ts`) com `getPrimaryPartnerId(profileId)`: `select id,status,created_at ... eq profile_id ... order(status='approved' desc, created_at asc) limit 1`.
- Substituir os `.eq("profile_id", ...).maybeSingle()` em: `RoleSwitcher.tsx`, `portal-selector.tsx`, `partner-approvals.functions.ts` (`getMyPartnerOnboarding`), `subscriptions.functions.ts`, `annual-activation.functions.ts`, `wallet-checkout.functions.ts`, `useMyReferralCode.ts`, `herbalife-boletos.functions.ts`, `challenge-tokens.functions.ts`, `withdrawals.functions.ts`, `admin-payouts.functions.ts` (linha 541).
- `partner.tsx` já usa a RPC `minhas_unidades_parceiro` e não precisa mudar, além de passar a unidade ativa ao gate.
- Sem migração de banco: os dados do Jean já estão corretos; o defeito é de aplicação.
