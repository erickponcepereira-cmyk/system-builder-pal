Esta lista tem ~10 mudanças significativas em painéis diferentes (coach, admin, simulador, perfil, FitMindShape, protocolo, saúde&metas, carreira/medalhas, loja). Vou propor uma ordem de execução em fases para entregar tudo de forma estável, e confirmar com você antes de implementar.

## Fase 1 — Quick wins de UI (sem migração)
1. **Botão WhatsApp do aluno** em todos os pontos onde o coach vê o aluno: lista "Meus Alunos" (coach + profissional), FitMindShape (seletor de cliente e header), Protocolo & Treinos (cabeçalho do aluno selecionado), Frequência/Check-in, Avaliações. Componente reutilizável `<WhatsAppButton phone={...} />` usando o helper `src/lib/whatsapp.ts` já existente. O link é gerado on-the-fly a partir do telefone — não precisa salvar nada novo no banco (telefone já é capturado no cadastro).
2. **Avaliar Aluno — todas as letras em branco**: ajustar classes de texto no `StudentEvaluationPanel` / `EvaluateTab`.
3. **Protocolo & Treinos > Alimentação**:
   - Campos "opção 1/2/3" viram `<Textarea>` grandes (multiline).
   - Botão "+ Nova observação" que cria card com título + texto livre, no mesmo padrão visual.
4. **Meu Perfil (coach) > Redes Sociais**: adicionar campos Instagram, Facebook, YouTube, TikTok, Site no `CoachProfileTab` (já existe `professional_public_profile` pra profissional — para coach vou usar campos diretos em `coaches` ou JSON `social_links`).

## Fase 2 — Loja: comissões corretas no NewSaleModal
5. No `NewSaleModal` ao selecionar produto: ler `commission_coach`, `commission_level1/2/3`, `app_fee` do produto e mostrar:
   - Comissão do coach (R$ e %)
   - Upline 1, 2, 3 (R$ e %)
   - Separar por método: **Cartão** (descontar taxa MP ~4,99%) vs **Pix/Boleto** (taxa ~0,99%). Usar `financialEngine.ts` que já existe.
   - Remover o "50% + 18%" hardcoded.

## Fase 3 — Saúde & Metas vinculado ao FitMindShape
6. Em `student.health.tsx` puxar última avaliação do aluno em `coach_body_assessments` e pré-preencher:
   - Calorias/dia → `basal_metabolism × fator atividade` (padrão 1.4, editável)
   - Meta de peso (editável)
   Campos permanecem editáveis pelo nutricionista/aluno; salva override em `student_health_goals` (nova tabela).

## Fase 4 — Visão Geral: bug "metas do mês não salvam" do outro coach
7. Investigar `OverviewTab` salvamento de metas. Provável: RLS exigindo `auth.uid() = coach.user_id` mas o coach é "criado por admin" sem user vinculado, ou faltando policy de UPDATE. Vou ler logs + policy da tabela `coach_monthly_goals` (ou equivalente) e corrigir.

## Fase 5 — Simulador de rede + Minha Rede
8. **Simulador**: trocar mocks por produtos reais (`products` ativos da Fitmind), usar % reais de upline 1/2/3 do produto. Renomear "Nível X" → "Upline X".
9. **Minha Rede - projeção**: campos numéricos editáveis por teclado (não só seta), botão **Salvar projeção** persistindo em nova tabela `coach_network_projections (coach_id, product_id, l1_sales, l2_sales, l3_sales, updated_at)`.

## Fase 6 — Sistema de Medalhas (maior bloco, migração nova)
10. Nova tabela `coach_badges` com enum:
    - `master_coach`
    - `coach_hbl_42`
    - `coach_hbl_50`
    - `nutritionist_partner`
    - `council`
11. Tabela `coach_badge_assignments (coach_id, badge_key, granted_by, granted_at)` — admin atribui no painel Carreira.
12. **Em cada produto (admin)** novas flags:
    - `allow_master_coach_sale boolean` (se true → master coach ganha 10% da comissão do coach que vendeu, deduzido)
    - `required_badge text` (se setado, só coach com essa medalha vê/vende — pra HBL 42% vs 50%)
13. **Engine de comissão**: estender `financialEngine` para:
    - Detectar venda cruzada (cliente fora da rede do master coach): coach da rede recebe comissão padrão, master coach ganha 10% deduzido dessa comissão.
    - Master coach vendendo direto: ganha 10% extra do lucro.
14. **Storefront/Loja**: filtrar produtos por medalha do coach (HBL 42% não vê HBL 50% e vice-versa).
15. **Atribuição de nutricionista parceiro** em vendas que exigem nutricionista: lógica de "mais próximo na rede / preferência indicação direta / seletor se empate". Vou começar pela parte mais simples (atribuição automática ao único nutricionista da rede, ou seletor manual) e depois evoluir geolocalização.
16. **FitMindShape grátis** pra "Medalha do conselho" — flag de bypass de pagamento.

---

## Pergunta antes de começar
Esse escopo é grande (especialmente Fase 6 — Medalhas, que é praticamente um subsistema novo). Posso executar tudo em sequência, mas vai gerar várias migrações e mudanças amplas em comissão/loja.

Sugiro priorizar:
- **Hoje:** Fases 1, 2, 3, 4 (rápidas, alto impacto, sem mexer em engine de comissão).
- **Próxima rodada:** Fase 5 (simulador/projeção).
- **Rodada dedicada:** Fase 6 (medalhas + lógica de comissão cruzada — precisa de cuidado pra não quebrar vendas existentes).

Confirma essa ordem? Ou prefere que eu ataque tudo de uma vez mesmo?

---

## Status atual (Fase 6 — finalizada parcialmente)
- ✅ Sistema de medalhas (`coach_badges`) + UI admin em Carreira
- ✅ Flags por produto: `required_badge`, `allow_master_coach_sale`, `free_for_council`, `free_for_nutritionist`
- ✅ Bypass FitMindShape: Conselho + Nutricionista Parceiro (helpers SQL `coach_has_fitmindshape_bypass`, `coach_gets_product_free`)
- ✅ Filtro de loja por medalha em `listSellableProducts`
- ✅ Comissão cruzada do Master Coach: registro em `master_coach_commissions` a cada `createCoachSale` (10% da comissão do vendedor quando `allow_master_coach_sale`)
- ✅ Atribuição automática de Nutricionista Parceiro: `sale_nutritionist_assignments` populado via `find_nutritionist_for(coach_id)`

## Próximos passos sugeridos
- ✅ Painel "Vendas cruzadas" do Master Coach na Carteira (total + cruzadas + lista)
- ✅ Exibir nutricionista atribuído no Admin > Pedidos + override manual
- Geolocalização para empate de nutricionistas

