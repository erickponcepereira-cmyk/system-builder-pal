# Correção das referências de Músculo Esquelético

Comparei a tabela enviada com o código em `src/lib/body-composition-calculator.ts` (função `getJanssenBand` + classificador `getSkeletalMuscleCategoryJanssen`) e há divergências reais.

## Divergências encontradas

| Grupo | Tabela (Normal) | Código atual | Status |
|---|---|---|---|
| Mulher 18-39 | 24,3 – 30,3 | 24,3 – 30,3 | OK |
| Mulher 40-59 | 24,1 – 30,1 | 24,1 – 30,1 | OK |
| Mulher 60-80 | 23,9 – 29,9 | 22,3 – 27,3 | **Errado** |
| Homem 18-39 | 33,3 – 39,3 | 33,3 – 39,3 | OK |
| Homem 40-59 | 33,1 – 39,1 | 32,4 – 37,4 | **Errado** |
| Homem 60-80 | 32,9 – 38,9 | 30,1 – 34,1 | **Errado** |

Além disso, a tabela define 4 categorias (Baixo / Normal / Alto / Muito Alto) e o código atual só tem 3 (Baixo / Normal / Alto), então "Muito Alto" nunca é reportado.

## O que vou alterar

Arquivo único: `src/lib/body-composition-calculator.ts`

1. Substituir `getJanssenBand` por faixas completas com 4 tiers por sexo/idade, exatamente iguais à tabela:
   - Mulher: 18-39 (24,3-30,3 / 30,4-35,3 / ≥35,4), 40-59 (24,1-30,1 / 30,2-35,1 / ≥35,2), 60-80 (23,9-29,9 / 30,0-34,9 / ≥35,0)
   - Homem: 18-39 (33,3-39,3 / 39,4-44,0 / ≥44,1), 40-59 (33,1-39,1 / 39,2-43,8 / ≥43,9), 60-80 (32,9-38,9 / 39,0-43,6 / ≥43,7)
2. Atualizar `getSkeletalMuscleCategoryJanssen` para retornar 4 rótulos: **Baixo** (amarelo), **Normal** (verde), **Alto** (verde escuro) e **Muito Alto** (novo — proponho azul `#3b82f6` para diferenciar de Alto). O tipo `eval` continua `"good" | "normal" | "warning" | "danger"` — "Muito Alto" fica como `"good"`.
3. Atualizar `getSkeletalMuscleReference` para exibir o range Normal (min–max do tier Normal) do grupo etário do aluno, mantendo o formato "24,3–30,3%".

Nenhuma alteração em UI/telas — os consumidores (`FitMindShape.tsx`) já usam essas funções e vão pegar as faixas corretas automaticamente.
