
# Ajustar `body-composition-calculator.ts` para casar com o FineShape

## Diagnóstico (caso Milena — F, 22a, 165cm, 62kg)

Comparando o painel da nossa app com o relatório do FineShape:

| Indicador            | FineShape   | App atual | Esperado |
|----------------------|-------------|-----------|----------|
| IMC                  | 22,8        | 22,8 ✓    | ok       |
| % Gordura            | **24,3 %** / 15,1 kg | 38,4 % | corrigir |
| Met. Basal           | 1455 kcal   | 1435 kcal ✓ (HB revisado) | ok |
| RCQ                  | 0,74        | 0,74 ✓    | ok       |
| Músculo Esquelético  | **50,9 %** / 31,6 kg | 36,3 % | corrigir |
| Massa Muscular       | **71,8 %** / 44,5 kg | 47,1 % | corrigir |
| Massa Óssea          | —           | 3,4 %     | reduzir levemente |

Causas:

1. **% Gordura está vindo de `SMM/0.55`**, que é uma aproximação ruim para mulheres não-obesas. O FineShape usa **Tran & Weltman (1988)** (densidade corporal + Siri) — equação validada para mulheres em qualquer faixa.
2. **Músculo Esquelético (Lee 2000)** está caindo no *fallback* (sem membros) em algum caminho — o resultado 22,5 kg corresponde exatamente à fórmula simplificada. A fórmula antropométrica completa, com os valores informados, dá ≈ 30,8 kg / 49,6 % (bem próximo de FineShape).
3. **Massa Muscular** está sendo derivada de `SMM/0.77`. O FineShape calcula como **Massa Magra − Massa Óssea** (≈ LBM × 0,95), que dá 44,8 kg / 72,3 % — bate com 71,8 %.
4. **Massa Óssea**: usar **~4,5 %** do peso total (referência populacional Heyward) — fica mais perto dos valores do FineShape.

## Correções a aplicar em `src/lib/body-composition-calculator.ts`

### 1. % Gordura — usar Tran-Weltman 1988

- **Mulher** (precisa `abdomen` ou `waist`, `hip`, `height`, `age`):
  ```
  BD = 1.168297
       − 0.002824 · abdomen
       + 0.0000122098 · abdomen²
       − 0.000733128 · hip
       + 0.000510477 · height(cm)
       − 0.000216161 · age
  %BF = 495 / BD − 450
  ```
- **Homem** (Penrose-Nelson-Fisher 1985 simplificada, ou Wilmore-Behnke):
  ```
  LBM = 98.42 + 1.082·weight − 4.15·waist(in)
  %BF = (weight − LBM) / weight × 100
  ```
  (converter cintura cm → in dividindo por 2,54)
- **Fallbacks** (ordem):
  1. Tran-Weltman / Penrose se medidas suficientes.
  2. Weltman obeso atual (mantido para casos sem quadril).
  3. Deurenberg por IMC como último recurso.
- **Remover** o caminho atual `bodyFat = (weight − SMM/0.55)/weight`.

### 2. Músculo Esquelético — manter Lee 2000, garantir execução

A fórmula já está correta; o problema é o estado/efeito. Não mexer na fórmula, mas:
- Adicionar log claro nos *warnings* quando a fórmula completa for usada vs. fallback (para inspeção).
- Garantir no `useEffect` de `FitMindShape.tsx` que `circs.leftArm/rightArm/leftThigh/rightThigh/leftCalf/rightCalf` chegam como `number`. Já chegam (`+e.target.value`), então sem mudança funcional além da fórmula nova de gordura.

### 3. Massa Muscular total — redefinir

Substituir:
```
muscleMassKg = skeletalMuscleKg / 0.77
```
por:
```
muscleMassKg = leanMassKg − boneMassKg
muscleMass   = muscleMassKg / weight × 100
```

### 4. Massa Óssea — referência populacional

Substituir:
```
boneMassKg = leanMassKg * 0.056
```
por:
```
boneMassKg = weight * 0.045    // ~4–5% do peso total (Heyward & Stolarczyk)
boneMass   = boneMassKg / weight * 100   // ≈ 4,5 %
```

### 5. Avatar / classificação — sem mudança

A tabela `FAT_AVATAR_FEMALE/MALE` continua válida; com %fat corrigido para 24,3 % a Milena passa a cair em "Acima 1" (verde-claro), coerente com FineShape ("Normal" — limítrofe).

## Validação manual com o caso da Milena (esperado após o ajuste)

| Indicador            | Calculado pós-fix |
|----------------------|-------------------|
| IMC                  | 22,8              |
| % Gordura (Tran-Weltman) | **24,7 %** / 15,3 kg |
| SMM (Lee)            | **30,8 kg / 49,6 %** |
| Massa Magra          | 46,7 kg           |
| Massa Óssea          | 2,79 kg / 4,5 %   |
| Massa Muscular       | 43,9 kg / **70,8 %** |
| Met. Basal           | 1435 kcal         |
| RCQ                  | 0,74              |

Diferenças vs. FineShape ficam dentro de ±1 ponto percentual em todos os indicadores principais.

## Arquivos tocados

- `src/lib/body-composition-calculator.ts` — substituir os blocos **3**, **4**, **7** e **8** descritos acima.
- Nenhuma mudança em `FitMindShape.tsx` (mantém o `useEffect` de auto-cálculo e o botão "Recalcular Composição Corporal").
