
-- Fase 5: Notificações de carreira

-- Trigger: meta de período batida (career_plan_progress.reward_earned = true)
CREATE OR REPLACE FUNCTION public.notify_career_period_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_plan_name text;
  v_reward text;
BEGIN
  IF NEW.reward_earned = true AND COALESCE(OLD.reward_earned, false) = false THEN
    SELECT c.profile_id INTO v_profile_id FROM coaches c WHERE c.id = NEW.coach_id;
    SELECT name, COALESCE(reward_description, name) INTO v_plan_name, v_reward
      FROM career_plan_config WHERE id = NEW.career_plan_id;

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, message, action_url)
      VALUES (
        v_profile_id,
        'career_reward',
        '🎉 Meta de carreira conquistada!',
        'Parabéns! Você atingiu a meta de "' || COALESCE(v_plan_name, 'plano') || '". Recompensa: ' || COALESCE(v_reward, 'a definir'),
        '/coach?tab=career'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_career_period_reward ON career_plan_progress;
CREATE TRIGGER trg_notify_career_period_reward
AFTER UPDATE ON career_plan_progress
FOR EACH ROW EXECUTE FUNCTION public.notify_career_period_reward();

-- Trigger: desafio mensal batido (career_challenge_progress.achieved_at preenchido)
CREATE OR REPLACE FUNCTION public.notify_career_challenge_achieved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_plan_name text;
BEGIN
  IF NEW.achieved_at IS NOT NULL AND OLD.achieved_at IS NULL THEN
    SELECT c.profile_id INTO v_profile_id FROM coaches c WHERE c.id = NEW.coach_id;
    SELECT cpc.name INTO v_plan_name
      FROM career_challenges cc
      JOIN career_plan_config cpc ON cpc.id = cc.career_plan_id
      WHERE cc.id = NEW.challenge_id;

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, message, action_url)
      VALUES (
        v_profile_id,
        'career_challenge',
        '🏆 Desafio mensal conquistado!',
        'Você bateu a meta de "' || COALESCE(v_plan_name, 'desafio') || '" este mês. Parabéns!',
        '/coach?tab=career'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_career_challenge_achieved ON career_challenge_progress;
CREATE TRIGGER trg_notify_career_challenge_achieved
AFTER UPDATE ON career_challenge_progress
FOR EACH ROW EXECUTE FUNCTION public.notify_career_challenge_achieved();

-- Trigger: top do ranking mensal (is_top_seller=true ou ranking_position=1)
CREATE OR REPLACE FUNCTION public.notify_ranking_top()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_month text;
BEGIN
  IF (NEW.ranking_position = 1 AND COALESCE(OLD.ranking_position, 0) <> 1)
     OR (NEW.is_top_seller = true AND COALESCE(OLD.is_top_seller, false) = false) THEN
    SELECT c.profile_id INTO v_profile_id FROM coaches c WHERE c.id = NEW.coach_id;
    v_month := to_char(NEW.reference_month, 'MM/YYYY');

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, message, action_url)
      VALUES (
        v_profile_id,
        'ranking_top',
        '🥇 Você é o #1 do ranking!',
        'Parabéns! Você liderou o ranking de ' || v_month || ' com ' || COALESCE(NEW.total_points, 0) || ' pontos.',
        '/coach?tab=ranking'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ranking_top_ins ON monthly_rankings;
CREATE TRIGGER trg_notify_ranking_top_ins
AFTER INSERT ON monthly_rankings
FOR EACH ROW
WHEN (NEW.ranking_position = 1 OR NEW.is_top_seller = true)
EXECUTE FUNCTION public.notify_ranking_top();

DROP TRIGGER IF EXISTS trg_notify_ranking_top_upd ON monthly_rankings;
CREATE TRIGGER trg_notify_ranking_top_upd
AFTER UPDATE ON monthly_rankings
FOR EACH ROW EXECUTE FUNCTION public.notify_ranking_top();
