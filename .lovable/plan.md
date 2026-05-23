## Objetivo
Alinhar **todas** as faixas de referência exibidas no FitMind Shape ao padrão FineShape (OMS / ACSM / Tanita / Janssen / Watson / Heyward). Sem mudar fórmulas de cálculo já corrigidas (Tran-Weltman, Penrose-Nelson-Fisher, Lee 2000, Harris-Benedict revisado).

## Tabelas que serão adotadas

### 1. IMC — OMS (já alinhado)
Mantém 8 níveis atuais: <18,5 / 18,5–24,9 / 25–27,4 / 27,5–29,9 / 30–34,9 / 35–39,9 / 40–44,9 / ≥45.
Label "Saudável" para 18,5–24,9 (renomear "Normal" → "Saudável" para casar com FineShape).

### 2. % Gordura — ACSM por idade ✅ (já feito)

### 3. Gordura Visceral — Tanita (padrão FineShape)
| Faixa | Classificação | Cor |
|-------|---------------|-----|
| 1–9   | Saudável      | verde |
| 10–14 | Alto          | amarelo |
| ≥ 15  | Muito alto    | vermelho |

### 4. RCQ — OMS (já alinhado, manter)
- Homem: <0,90 baixo | 0,90–0,99 moderado | ≥1,00 alto
- Mulher: <0,80 baixo | 0,80–0,84 moderado | ≥0,85 alto

### 5. Músculo Esquelético — Janssen et al. (2002) por sexo+idade
**Homens** (% do peso corporal)
| Idade | Baixo | Normal | Alto |
|-------|-------|--------|------|
| 18–39 | <37   | 37–43  | >43  |
| 40–59 | <34   | 34–39  | >39  |
| 60+   | <31   | 31–35  | >35  |

**Mulheres**
| Idade | Baixo | Normal | Alto |
|-------|-------|--------|------|
| 18–39 | <28   | 28–33  | >33  |
| 40–59 | <26   | 26–30  | >30  |
| 60+   | <24   | 24–27  | >27  |

### 6. Massa Muscular Total — referência FineShape
- Homem: 33–39% saudável (mesma escala de "Músculo" da bioimpedância FineShape)
- Mulher: 24–30% saudável

### 7. Água Corporal — Watson et al.
- Homem adulto: 50–65% (ideal ~60%)
- Mulher adulta: 45–60% (ideal ~55%)

### 8. Massa Óssea — Heyward & Stolarczyk (faixa por peso)
| Peso | Homem | Mulher |
|------|-------|--------|
| <60 kg | ≥2,5 kg | ≥1,8 kg |
| 60–75 kg | ≥2,9 kg | ≥2,2 kg |
| >75 kg | ≥3,2 kg | ≥2,5 kg |

### 9. Metabolismo Basal — Harris-Benedict revisado (já é a fórmula). Classificação:
- < 0,90× HB → Baixo
- 0,90–1,10× HB → Normal
- > 1,10× HB → Acima

### 10. Idade Corporal — modelo Tanita-like
`idadeCorporal = idade + (bodyFat − idealMid) × 0.5`, limitado a `[idade−10, idade+25]`. Já implementado; manter mas atualizar `idealMid` para o ponto médio da faixa ACSM por idade (em vez de constante 12,5/21).

### 11. Peso Ideal — IMC 18,5–24,9 (mantém)

## Mudanças em código

### `src/lib/body-composition-calculator.ts`
- `getSkeletalMuscleReference(gender, age)` → tabela Janssen por faixa etária; retorna `"<min>–<max>%"`.
- Adicionar `getSkeletalMuscleCategoryJanssen(pct, gender, age)` → `{ label, eval, color }` (Baixo / Normal / Alto).
- Adicionar `getMuscleMassReference(gender)` → `"33–39%"` / `"24–30%"`.
- Adicionar `getBodyWaterReference(gender)` → `"50–65%"` / `"45–60%"`.
- Adicionar `getBoneMassReference(gender, weight)` → string da faixa Heyward.
- Adicionar `getBoneMassCategory(boneKg, gender, weight)` → eval normal/baixo.
- Adicionar `getVisceralFatCategory(v)` → `{ label, eval, color }` (substitui `VISCERAL_FAT_RANGES` local).
- Atualizar bodyAge no cálculo: `idealMid = (healthyMin + healthyMax)/2` da banda ACSM.

### `src/components/coach/FitMindShape.tsx`
- `BMI_RANGES`: renomear label do nível 1 de **"Normal" → "Saudável"** (8 níveis preservados).
- `VISCERAL_FAT_RANGES`: substituir pela função `getVisceralFatCategory` do calculator.
- `refSkeletal` (linha ~2699): `getSkeletalMuscleReference(gender, a.age)`.
- Adicionar variáveis e linhas de referência nos cards:
  - `refMuscleMass = getMuscleMassReference(gender)`
  - `refWater = getBodyWaterReference(gender)`
  - `refBone = getBoneMassReference(gender, a.weight)`
- `refVisceral`: `"1–9 (saudável)"`.
- Classificação textual "Saudável" / "Sobrepeso" / "Obesidade" passa a vir do `bmiCat` renomeado (sem mudar avatar — IMC continua sendo a fonte).

### Sem mudanças
- Fórmulas de cálculo (gordura, SMM Lee, basal Harris-Benedict, RCQ).
- Avatar continua sendo escolhido pelo IMC (decisão da rodada anterior).
- Estrutura visual / layout dos cards.

## Resultado esperado
Todos os cards do resultado mostrarão a faixa de referência no formato e nos valores idênticos aos do laudo FineShape (mulher 22a, 62kg → Gordura 21–32%, Músculo 28–33%, Água 45–60%, Visceral 1–9, RCQ <0,80, IMC 18,5–24,9).
