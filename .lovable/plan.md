## Comparação — Tabelas atuais vs. folha "Avaliação do Bem Estar Fit Mind"

### 1. IMC (Classificação da OMS)
**Referência:** <18,5 (baixo) · 18,5–24,9 (normal) · 25–29,9 (sobrepeso) · ≥30 (obesidade)
**Código atual (`BMI_RANGES`):** usa 8 faixas só para o avatar (18,5 / 24,9 / 27,4 / 29,9 / 34,9 / 39,9 / 44,9 / >). Os pontos de corte principais (18,5 / 25 / 30) coincidem com a OMS.
**Status:** ✅ compatível (as 8 faixas do avatar são um refinamento estético — os limites OMS estão preservados).

### 2. % Gordura (Fat) por Gênero e Idade
**Referência (folha):**

| Gênero | Idade  | Baixo   | Normal      | Alto        | Muito Alto |
|--------|--------|---------|-------------|-------------|------------|
| Mulher | 20-39  | <21,0   | 21,0-32,9   | 33,0-38,9   | ≥39,0      |
| Mulher | 40-59  | <23,0   | 23,0-33,9   | 34,0-39,9   | ≥40,0      |
| Mulher | 60-79  | <24,0   | 24,0-35,9   | 36,0-41,9   | ≥42,0      |
| Homem  | 20-39  | <8,0    | 8,0-19,9    | 20,0-24,9   | ≥25,0      |
| Homem  | 40-59  | <11,0   | 11,0-21,9   | 22,0-27,9   | ≥28,0      |
| Homem  | 60-79  | <13,0   | 13,0-24,9   | 25,0-29,9   | ≥30,0      |

**Código atual (`getAcsmBand`):** usa faixas ACSM/Lohman muito mais estreitas:
- Homem <40: normal 14–19 (folha: 8–19,9) · overweight máx 24 (folha ≥25 = muito alto)
- Mulher <40: normal 24–29 (folha: 21–32,9) · overweight máx 35 (folha ≥39)

**Status:** ❌ **divergente**. A folha (referência Omron/Tanita) é mais tolerante que ACSM. Alunos classificados como "Sobrepeso/Obesidade" hoje seriam "Normal" pela tabela oficial Fit Mind.

### 3. % Músculo Esquelético por Gênero e Idade
**Referência (folha):**

| Gênero | Idade  | Baixo   | Normal      | Alto        | Muito Alto |
|--------|--------|---------|-------------|-------------|------------|
| Mulher | 18-39  | <24,3   | 24,3-30,3   | 30,4-35,3   | ≥35,4      |
| Mulher | 40-59  | <24,1   | 24,1-30,1   | 30,2-35,1   | ≥35,2      |
| Mulher | 60-80  | <23,9   | 23,9-29,9   | 30,0-34,9   | ≥35,0      |
| Homem  | 18-39  | <33,3   | 33,3-39,3   | 39,4-44,0   | ≥44,1      |
| Homem  | 40-59  | <33,1   | 33,1-39,1   | 39,2-43,8   | ≥43,9      |
| Homem  | 60-80  | <32,9   | 32,9-38,9   | 39,0-43,6   | ≥43,7      |

**Código atual (`getJanssenBand`):** valores idênticos aos da folha.
**Status:** ✅ **bate exatamente** com a referência.

### 4. % Gordura Visceral
**Referência (folha):** 6 níveis
1-2 (Ideal) · 3-4 (Normal) · 5-6 (Médio) · 7-9 (Alto) · 10-12 (Muito Alto) · >12 (Perigo p/ Saúde)

**Código atual (`getVisceralFatCategory`):** apenas 3 níveis
≤9 (Saudável) · 10-14 (Alto) · >14 (Muito Alto)

**Status:** ❌ **divergente**. Faltam os níveis intermediários e o limite superior está errado: pela folha o "perigo à saúde" já começa em >12, no código só em >14.

---

## Correções propostas

**Arquivo:** `src/lib/body-composition-calculator.ts`

1. **Substituir `getAcsmBand`** pelas faixas do "Bem Estar Fit Mind" (Omron/Tanita) por gênero+idade (3 faixas etárias × 2 gêneros). Renomear helpers correlatos (`getBodyFatReference`, `getBodyFatCategoryACSM`, `getBodyFatHealthyRange`) para retornarem os novos limites, mantendo a mesma assinatura para não quebrar callers em `FitMindShape.tsx`/`FitMindShapeResultView.tsx`. Categorias retornadas: `"Baixo" | "Normal" | "Alto" | "Muito Alto"` mapeadas para `eval` `warning/good/warning/danger`.

2. **Substituir `getVisceralFatCategory`** por uma versão de 6 níveis idêntica à folha:
   - 1-2 → Ideal (good, verde)
   - 3-4 → Normal (good, verde-claro)
   - 5-6 → Médio (normal, amarelo)
   - 7-9 → Alto (warning, laranja)
   - 10-12 → Muito Alto (danger leve, vermelho-claro)
   - >12 → Perigo à Saúde (danger, vermelho-escuro)
   
   Atualizar `getVisceralFatReference()` para "1–2 (ideal)".

3. **Manter `getJanssenBand`** (% Músculo Esquelético) — já está correto.

4. **Manter `BMI_RANGES`** em `FitMindShape.tsx` — o refinamento em 8 níveis é para o avatar, os cortes OMS (18,5/25/30) continuam preservados.

### Nada será alterado

- Cálculo de gordura corporal (Weltman/Penrose/Deurenberg) — só a **classificação** muda.
- Metabolismo basal, RCQ, água corporal, massa óssea, idade corporal.
- Frontend: nenhuma mudança de UI necessária (as funções expõem `label`/`color`/`eval` que os componentes já consomem).

### Verificação

Após a mudança, revalidar em `FitMindShape` uma avaliação de teste (ex.: mulher 30 anos, 28% gordura → deve virar "Normal", não "Sobrepeso"; visceral 11 → "Muito Alto", não "Alto").
