import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TestModeInfo {
  enabled: boolean;
  cutoffAt: string | null;
}

let cache: TestModeInfo | null = null;
let cachedAt = 0;
const TTL_MS = 15_000;

/** Client-side fetch with short cache. Used by listing pages to filter `created_at >= cutoff`. */
export async function fetchTestMode(force = false): Promise<TestModeInfo> {
  const now = Date.now();
  if (!force && cache && now - cachedAt < TTL_MS) return cache;
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["test_mode_enabled", "test_mode_cutoff_at"]);
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));
  cache = {
    enabled: String(map.get("test_mode_enabled") || "false") === "true",
    cutoffAt: (map.get("test_mode_cutoff_at") as string) || null,
  };
  cachedAt = now;
  return cache;
}

export function invalidateTestModeCache() { cache = null; cachedAt = 0; }

export function useTestMode() {
  const [info, setInfo] = useState<TestModeInfo>(cache ?? { enabled: false, cutoffAt: null });
  const [loading, setLoading] = useState(!cache);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setInfo(await fetchTestMode(true)); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    fetchTestMode().then((v) => { if (mounted) { setInfo(v); setLoading(false); } });
    return () => { mounted = false; };
  }, []);
  return { ...info, loading, reload };
}

/** Cutoff ISO active for filtering, or null. */
export async function getClientCutoffIso(): Promise<string | null> {
  const m = await fetchTestMode();
  return m.enabled && m.cutoffAt ? m.cutoffAt : null;
}
