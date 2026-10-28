-- O desafio passa a aceitar mais de quatro turmas.
--
-- 27/10/2026: criar a Turma 5 do desafio de outubro dava
-- "violates check constraint competition_groups_group_number_check". A regra
-- só aceitava `group_number` de 1 a 4 — nada no app nem nas funções do banco
-- depende desse teto: a tela sugere o próximo número sozinha, e a numeração
-- única por desafio continua garantida por
-- `competition_groups_competition_id_group_number_key`.

ALTER TABLE public.competition_groups
  DROP CONSTRAINT competition_groups_group_number_check;

ALTER TABLE public.competition_groups
  ADD CONSTRAINT competition_groups_group_number_check CHECK (group_number >= 1);
