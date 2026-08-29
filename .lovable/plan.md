# Ajustar exibição dos resultados do desafio

## 1. Hall da Fama — tirar "p.p."

- Gordura: exibir `−7,90%` (sinal de menos, porque perdeu).
- Peso (kg): exibir `−8,9 kg`.
- Músculo: exibir `+4,30%` (sinal de mais, porque ganhou).
- Nenhuma mudança de ordenação nem de cálculo — só o texto.

O mesmo padrão será aplicado ao painel de admin (hoje mostra "p.p. gord."), para os dois ficarem iguais.

## 2. Painel do aluno/coach — o `-8.14%` do cabeçalho

Esse número é a variação percentual do **peso corporal** (8,9 kg de 109,3 kg = 8,14%), que não é a métrica do desafio e confunde.

Passa a mostrar no cabeçalho do cartão a **métrica oficial do desafio: % de gordura**, como diferença em pontos:

```text
32,2% → 24,3%   →   −7,9% gord.
```

Se a pessoa ainda não tiver as duas medições de gordura, o cabeçalho cai para a variação de peso em kg (`−8,9 kg`), e só mostra nada se não houver nenhuma medição.

A tabela detalhada (Peso / % Gordura / % Músculo com a coluna Variação) continua igual, apenas com os sinais coerentes: gordura e peso com "−" quando reduz, músculo com "+" quando aumenta.

## Detalhes técnicos

- `src/components/HallOfFame.tsx`: `unit`/`fmtVal` em `RankList` — remover `" p.p."`, usar `%` para gordura/músculo, prefixo `−` para fat/kg e `+` para muscle.
- `src/routes/_authenticated/admin.challenge.tsx`: `fmtResult` — trocar `p.p. gord.` por `% gord.`.
- `src/components/coach/tabs/ChallengeTab.tsx` (linhas ~467-543): substituir o badge baseado em `result_pct` por cálculo `initial_body_fat − final_body_fat` (fallback para kg), e normalizar os sinais das linhas da tabela de variação.
- Sem alteração de banco de dados.
