# Módulo de Corrida + arquitetura modular por rede/coach

## Contexto verificado

- O Painel de Evolução do aluno hoje é uma página única (`student.evolution`) com foto de evolução, metas e Método das Janelas — sem abas.
- A conta `carolheming25@gmail.com` existe como **coach** e já possui tema visual próprio (`carol`) na tabela de temas de marca. O tema é aplicado automaticamente pelo provedor de identidade visual (logo, cores, nome), então a aba Corrida herda a identidade da Carol sem código específico.
- A identidade visual já é resolvida por coach/parceiro, não por e-mail. Nada disso precisa ser refeito.

## O que será construído

### 1. Módulos por rede (arquitetura)

Nova configuração administrativa que define quais módulos cada escopo enxerga, com a ordem de prioridade pedida:

```text
usuário (perfil)  →  coach/profissional/parceiro  →  rede (upline)  →  White Label (tema)  →  padrão FitMind
```

- Módulos previstos desde já: Nutrição, Corrida, Treinos, Mentalidade, Benefícios, Avaliação Física (ligar/desligar).
- Padrão FitMind: Corrida OFF, demais como hoje (nada muda para quem já usa o app).
- Ativação inicial: Corrida ON para o coach Carol Aventureira — herdada por toda a rede abaixo dela.
- Exceções individuais por perfil já suportadas pela estrutura.

### 2. Painel de Evolução com abas

- A página atual vira a aba **Nutrição**, com exatamente o mesmo conteúdo e comportamento.
- A aba **Corrida** só aparece quando o módulo está habilitado para aquele usuário. Quem não tem o módulo continua vendo a tela atual, sem abas.

### 3. Aba Corrida

Ordem da tela (mobile-first, cards, ícones esportivos):

1. **Indicadores**: melhor pace, KM no mês, mês com maior KM, pace médio, provas participadas, dias corridos.
2. **Botão + Registrar Corrida**.
3. **Nível de distância** (KM acumulados) com escudo, barra de progresso, percentual e "faltam X km para o nível Y".
4. **Nível de pace** (classificação separada, baseada no melhor pace).
5. **Histórico de corridas** com editar, excluir e detalhes.
6. **Gráficos**: KM por mês, evolução do pace, dias corridos por mês.
7. Aviso discreto: "Integração automática em desenvolvimento" com o texto sugerido.

Escudos: Branco 0–100, Azul 100–300, Rosa 300–500, Verde 500–1.000, Preto 1.000–3.000, Vermelho 3.000–10.000 km. Pace: 7 Branco, 6 Azul, 5 Rosa, 4 Verde, 3 Preto, abaixo de 3 Vermelho. Níveis não alcançados aparecem apagados, como já é feito nas medalhas de carreira.

### 4. Registro de corrida

Formulário com data, distância (km), tempo total, pace (calculado automaticamente a partir de distância + tempo, editável), tipo de atividade, treino ou prova, nome da prova, cidade/local, observações e foto/comprovante opcional (com o recorte 1:1 já existente).

### 5. Admin → Personalização da Rede

Nova página no painel admin: buscar coach, profissional, parceiro, perfil ou tema/White Label e ligar/desligar módulos com switches, mostrando de onde vem a configuração herdada quando não houver regra própria.

## Detalhes técnicos

- **Banco**: tabela `run_logs` (registros de corrida por aluno, com campos para origem do dado — `manual`, `strava`, `garmin`, etc. — e id externo, preparando integrações futuras sem refazer o módulo); tabela `module_settings` (escopo: `profile` | `coach` | `partner` | `theme` | `global`, id do escopo, chave do módulo, habilitado); função `resolver_modulos(_profile_id)` que percorre perfil → papéis → cadeia de upline → tema → padrão. GRANTs e RLS por dono em todas as tabelas novas; leitura de módulos pelo próprio usuário, escrita só por admin.
- **Estatísticas** calculadas em função no banco (`run_stats`) para evitar baixar todo o histórico no celular.
- **Frontend**: `src/routes/_authenticated/student.evolution.tsx` passa a montar abas; o conteúdo atual vai para `src/components/student/NutritionEvolutionTab.tsx` sem alteração de lógica; novo `src/components/student/running/` com painel, formulário, histórico, escudos e gráficos (Recharts, já disponível). Hook `useEnabledModules()` para consultar os módulos liberados.
- **Admin**: `src/routes/_authenticated/admin.modules.tsx` + funções de servidor com verificação de admin, seguindo o padrão de `admin.branding.tsx`.
- A migração inicial insere a regra Corrida ON para o coach da Carol pelo ID do coach (o e-mail é usado apenas para localizar a conta).

## Fora de escopo agora

Integrações reais com Strava, Garmin, Apple Health e Health Connect — apenas a estrutura de dados fica preparada.
