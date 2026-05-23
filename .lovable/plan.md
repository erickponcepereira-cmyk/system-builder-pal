## Objetivo
1. Avatar e nível de obesidade no FitMind Shape passam a usar **apenas o IMC** (gordura corporal vira métrica informativa).
2. Tabela de % gordura alinhada ao **FineShape (ACSM por idade e sexo)** — corrige a divergência (13–22% atual vs 20–25% mostrado no FineShape).

## Tabela de referência ACSM (FineShape) que será adotada

**Mulheres**
| Idade | Saudável | Sobrepeso | Obesa |
|-------|----------|-----------|-------|
| 20–39 | 21–32%   | 33–38%    | ≥ 39% |
| 40–59 | 23–33%   | 34–39%    | ≥ 40% |
| 60–79 | 24–35%   | 36–41%    | ≥ 42% |

**Homens**
| Idade | Saudável | Sobrepeso | Obeso |
|-------|----------|-----------|-------|
| 20–39 | 8–19%    | 20–24%    | ≥ 25% |
| 40–59 | 11–21%   | 22–27%    | ≥ 28% |
| 60–79 | 13–24%   | 25–29%    | ≥ 30% |

Sub-faixas internas para granularidade no painel: Muito baixo / Atlético / Saudável / Aceitável / Sobrepeso / Obesidade.

## Mudanças

### `src/lib/body-composition-calculator.ts`
- Substituir `FAT_AVATAR_MALE` / `FAT_AVATAR_FEMALE` por uma função **`getBodyFatCategoryACSM(bodyFat, gender, age)`** que retorna `{ label, color, eval }` baseada na tabela ACSM acima.
- `getBodyFatReference(gender, age)` retorna a faixa "Saudável" correspondente à idade (ex.: mulher 25a → `"21–32%"`).
- Manter `getAvatarFromBodyFat` exportado para compatibilidade, mas **não usado mais** para escolher avatar (marcar como deprecated).
- Em `calculateBodyComposition`, derivar `avatarIndex/Label/Color` **a partir do IMC** usando a tabela `BMI_RANGES` (8 níveis já existentes em `FitMindShape.tsx`, replicar a mesma escala aqui).

### `src/components/coach/FitMindShape.tsx`
- Substituir `BODY_FAT_RANGES` por chamadas a `getBodyFatCategoryACSM(pct, gender, age)`.
- Em `getBodyFatCategory`, passar `client.age` (calculado de `birth_date`) além de gênero.
- No bloco do avatar (linhas ~2614-2617): remover o ramo `a.bodyFat ? getAvatarFromBodyFat(...)` — usar **sempre** `bmiCat` (`BMI_RANGES`) para `avatarEntry`.
- Linha 2918: label do avatar passa a mostrar `${bmiCat.label} · IMC ${bmi}` (sem fallback de gordura).
- Atualizar `idealMinPct/idealMaxPct` (linhas 2770-2774) para usar os limites da faixa **Saudável ACSM** por idade (ex.: mulher 20-39 → 21–32, homem 20-39 → 8–19).
- Linha 2701 `refBodyFat`: usar `getBodyFatReference(gender, age)` em vez de string fixa `"13–22%"`.
- Preview de medidas (linha 2024) continua mostrando `% Gordura` como métrica informativa, sem influenciar avatar.

### Sem mudanças
- Lógica de cálculo de `bodyFat` em si (Tran-Weltman / Penrose-Nelson-Fisher) permanece.
- IMC, SMM (Lee), Massa Magra, Massa Óssea, RCQ — inalterados.
- `FAT_AVATAR_*` constantes podem ser removidas após a refatoração (não há outro consumidor).

## Resultado esperado
- Caso Milena (F, 22a, bodyFat ≈ 24.7%) → classificação **"Saudável"** (21–32%), avatar continua sendo escolhido pelo IMC (62/1.65² = 22.8 → "Normal").
- Tooltip/legenda da gordura mostra `21–32%` (igual ao FineShape) em vez de `13–22%`.
