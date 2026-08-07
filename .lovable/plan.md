# Fotos de clientes, medalhas e escudos de patente

## O que está acontecendo (verificado no banco)

1. **Fotos dos clientes**: a foto de perfil hoje é salva na coluna `photo_url` (a tela "Editar perfil" grava lá). Vários painéis ainda leem só a coluna antiga `avatar_url`, que está vazia na maioria dos cadastros — por isso aparece só a inicial. Exemplo confirmado: Katia Carrasco tem `photo_url` preenchido e `avatar_url` nulo.
2. **Escudo da próxima patente / próxima medalha**: os cards de "PRÓXIMA PATENTE" (ex.: Coach Contribuidor) e "PRÓXIMA MEDALHA" simplesmente não renderizam imagem — só texto e barra de progresso. As imagens existem no banco e no storage (37 arquivos), e aparecem normalmente nos cards de "patente atual" e nas listas.
3. **Clube dos Campeões**: as medalhas do Clube (100K, 250K, 500K, 1M, 2,5M, 5M, 10M) estão **sem imagem cadastrada** (`image_url` nulo). Nunca foram enviadas. Essas precisam de upload no admin.

## O que será feito

### Fotos dos clientes
Criar um helper único de foto de perfil (`photo_url` com fallback para `avatar_url`) e aplicá-lo em todos os pontos que hoje leem só `avatar_url`:
- Aniversariantes (semana/mês/admin)
- Hall da Fama
- Calendário FitMind (presenças/reservas)
- Scanner de gratuitos do parceiro
- Agendamentos do profissional
- Inscrições e presenças de eventos FitMind

Onde as consultas hoje selecionam só `avatar_url`, passam a selecionar as duas colunas.

### Escudos e medalhas
- Card "Próxima patente": exibir o escudo da patente ao lado do nome (mesmo componente `BadgeImage` já usado), em versão levemente esmaecida por ainda não conquistada.
- Card "Próxima medalha" (mensal e acumulada): exibir a imagem da medalha do mesmo jeito.
- Quando não houver imagem cadastrada, manter o ícone atual como fallback.

### Clube dos Campeões sem imagem
As 7 medalhas do Clube continuarão com ícone até que as artes sejam enviadas pelo admin (Admin → regras de medalhas → imagem). Se você me enviar as imagens, eu subo e vinculo.

## Detalhes técnicos
- Novo util `src/lib/profile-photo.ts` com `profilePhoto(p)` retornando `photo_url ?? avatar_url ?? null`.
- Ajustes de `select(...)` nos arquivos: `BirthdaysCard.tsx`, `HallOfFame.tsx`, `FitmindCalendar.tsx`, `PartnerFreebieScanner.tsx`, `professional-appointments.functions.ts`, `fitmind-registrations.functions.ts`, `fitmind-attendance.functions.ts`.
- `IndividualCareerTab.tsx` (CurrentMedalPanel/próxima medalha) e `ConstructorsCareerTab.tsx` (bloco "Próxima patente") passam a renderizar `BadgeImage` com `image_url`.
- Sem mudanças de regra de negócio, comissões ou banco.
