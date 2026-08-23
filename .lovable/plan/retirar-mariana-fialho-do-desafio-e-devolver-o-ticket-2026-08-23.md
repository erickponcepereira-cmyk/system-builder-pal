# Retirar Mariana Fialho do desafio e devolver o ticket

## Situação encontrada

- Perfil: Mariana Fialho (mari.gfialho@gmail.com)
- Inscrição feita hoje, 23/08 às 15:21, status "inscrita", sem pesagem inicial nem final registrada
- O ticket dela (comprado às 15:20) foi consumido por essa inscrição
- Não existe nenhum agendamento de pesagem nem avaliação física ligada a essa inscrição

Ou seja: dá para desfazer com segurança, sem perder nada.

## O que será feito

Uma correção pontual no banco, só para ela:

1. Liberar o ticket: apagar as marcas de "usado" (data de uso, desafio e inscrição vinculada) e registrar uma observação explicando que foi estorno de inscrição feita por engano.
2. Remover a inscrição dela no desafio (e o vínculo com o grupo em que caiu).

Resultado: ela some da lista do desafio e o ticket volta a aparecer como disponível, podendo ser usado de novo quando ela quiser entrar.

## Detalhes técnicos

- `student_challenge_tokens` id `da5a2774…`: `consumed_at`, `consumed_competition_id`, `consumed_enrollment_id` → NULL, `notes` com o motivo do estorno.
- `competition_enrollments` id `725ede59…`: DELETE (ordem: liberar o token primeiro, depois apagar a inscrição, para não esbarrar em chave estrangeira).
- Nada retroativo além dessas duas linhas; nenhuma função, política ou tela é alterada.
