# Corrigir o cálculo do resultado do desafio (% de gordura)

## O que foi verificado

O valor mostrado na coluna "Resultado" vem da coluna `result_fat_pct_lost`, preenchida pelo gatilho `calc_competition_results` no banco. Hoje ele calcula a **redução relativa**:

```text
(32,2 − 24,3) / 32,2 × 100 = 24,53%
```

Por isso aparece 24,53% em vez dos 7,9 pontos percentuais esperados. O mesmo acontece com o ganho de músculo (`result_muscle_gain_pct`), que também usa variação relativa.

Peso (`result_kg` e `result_pct`) está correto: kg perdidos e % do peso corporal.

## O que será feito

1. **Gordura**: passar a gravar a diferença absoluta em pontos percentuais — `inicial − final` (32,2 − 24,3 = 7,90).
2. **Músculo**: mesma lógica — `final − inicial` em pontos percentuais (ex.: 35,7 − 31,4 = 4,30), para ficar coerente com a gordura.
3. **Recalcular o histórico**: reprocessar todas as inscrições que já têm pesagem inicial e final, para que os valores antigos deixem de estar inflados.
4. **Hall da Fama**: atualizar os resultados já publicados que foram copiados com a fórmula antiga, e reordenar os rankings afetados (a ordem pode mudar, porque quem tinha % inicial baixo era penalizado pela regra antiga).
5. **Rótulos**: exibir "p.p. gord." (pontos percentuais) no painel de admin e no Hall da Fama, para não confundir com percentual de redução.

## Detalhes técnicos

- Migração: `CREATE OR REPLACE FUNCTION public.calc_competition_results()` trocando as duas fórmulas para diferença absoluta, mantendo `search_path` e demais campos; seguido de `UPDATE public.competition_enrollments SET updated_at = now()` (ou update direto dos campos) para reprocessar as linhas com ambas as pesagens, e `UPDATE public.competition_hall_of_fame` recalculando `result_fat_pct_lost`/`result_muscle_gain_pct` a partir da inscrição vinculada + recomputo de `rank` por competição/gênero/métrica.
- Frontend: `src/routes/_authenticated/admin.challenge.tsx` (`fmtResult`) e `src/components/HallOfFame.tsx` — apenas o texto da unidade; nenhuma mudança de ordenação no código (a ordenação continua por maior valor).
