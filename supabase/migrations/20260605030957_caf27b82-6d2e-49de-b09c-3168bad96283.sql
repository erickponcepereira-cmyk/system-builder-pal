-- Add event_creator badge to coach_badge_key enum
ALTER TYPE public.coach_badge_key ADD VALUE IF NOT EXISTS 'event_creator';