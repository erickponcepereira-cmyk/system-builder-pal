export interface RunLog {
  id: string;
  profile_id: string;
  run_date: string;
  distance_km: number;
  duration_seconds: number;
  pace_seconds: number;
  activity_type: string;
  is_race: boolean;
  race_name: string | null;
  location: string | null;
  notes: string | null;
  photo_url: string | null;
  source: string;
  created_at?: string;
}

export interface RunStats {
  total_km: number;
  best_pace: number | null;
  avg_pace: number | null;
  km_month: number;
  days_month: number;
  races: number;
  total_runs: number;
  best_month_km: number;
  best_month: string | null;
}
