# Corrigir sexo trocado na avaliação do aluno

## O que está acontecendo (verificado)

- O sexo do usuário fica salvo no cadastro (perfil) como `M`, `F` ou `O`. Hoje: 35 masculinos, 115 femininos e **68 perfis sem sexo preenchido**.
- A ficha de avaliação (a base do FitMindShape) guarda o sexo separado. Hoje há **184 fichas com sexo "outro"**.
- Quando a ficha fica com "outro" (ou vazia), **toda a tela de resultado trata a pessoa como Feminino** — cabeçalho, avatar, faixas de gordura, RCQ e classificações. Foi exatamente isso no caso do Adriano: a ficha dele está como "outro" e o perfil dele está **sem sexo preenchido** (conta criada em 21/07, antes do campo virar obrigatório).
- Existe ainda um caminho de criação de ficha pelo painel do coach (ao abrir "Avaliar aluno" vindo do desafio) que tenta ler o sexo de um campo que **não existe** na tabela de alunos — então essa consulta falha e a ficha nasce sempre como "outro", mesmo quando o perfil tem o sexo certo.

Resumo: dois furos — origem errada do dado ao criar a ficha, e "sexo desconhecido" sendo silenciosamente exibido/calculado como feminino.

## Correções

1. **Ler o sexo da fonte certa**: no fluxo do painel do coach, buscar o sexo no perfil da pessoa (M/F/O) em vez do campo inexistente na tabela de alunos. Assim a ficha nasce com o sexo do cadastro.
2. **Nunca assumir feminino**: quando o sexo da ficha for desconhecido ("outro"/vazio), a tela de resultado e a lista deixam de mostrar "Feminino" e passam a mostrar "Sexo não definido", com um aviso destacado de que os índices dependentes de sexo (gordura, RCQ, avatar, faixas) só são confiáveis após definir. Cálculos dependentes ficam marcados como pendentes até a definição.
3. **Definir/corrigir em um clique**: no cabeçalho da avaliação e no card do aluno, botão para escolher Masculino/Feminino. Ao salvar, atualiza a ficha e, quando a ficha estiver vinculada a um aluno, também grava no perfil dele — o cadastro e a avaliação param de divergir.
4. **Sincronização quando o perfil tem o dado**: sempre que a ficha estiver como "outro"/vazia e o perfil vinculado tiver M ou F, a ficha adota o valor do perfil ao ser aberta.
5. **Ajuste retroativo**: corrigir as fichas existentes que estão como "outro" mas cujo aluno vinculado tem sexo definido no perfil (inclui reavaliar o caso do Adriano assim que o sexo dele for preenchido). As que continuarem sem informação ficam com o novo aviso, em vez de virar "feminino".
6. **Cadastro novo**: o seletor de sexo do formulário de nova ficha deixa de vir pré-marcado como "Feminino" — passa a exigir escolha explícita.

## Detalhes técnicos

- `src/components/coach/tabs/EvaluateTab.tsx`: trocar o `select("gender,...")` em `students` por leitura de `profiles.gender` via join do `profile_id`; mapear `M→male`, `F→female`, resto → `unknown`. Aplicar o mesmo mapeamento na criação de ficha "self".
- `src/components/coach/FitMindShape.tsx` e `FitMindShapeResultView.tsx`: parar de usar `gender === "male" ? masc : fem`; introduzir helper `normalizeGender()` com três estados (`male`/`female`/`unknown`) e renderizar rótulo/avatar/classificações conforme, com banner de pendência quando `unknown`.
- Ação de definição de sexo: `update` em `coach_evaluation_clients.gender` + `update` em `profiles.gender` quando houver `student_id`.
- Página pública `resultado.$token` e `assessment-share.functions.ts`: propagar o estado `unknown` em vez de cair em feminino.
- Migração de dados: `UPDATE coach_evaluation_clients c SET gender = CASE p.gender WHEN 'M' THEN 'male' WHEN 'F' THEN 'female' END` para as fichas com `gender` em ('other', null) cujo perfil vinculado tenha M/F.
